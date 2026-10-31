import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { query, withTransaction } from '../db/connection.js';
import { ProjectManager } from '../projects/manager.js';
import { FileScanner, ScannedFile } from './scanner.js';
import { CodeParser } from '../parsers/index.js';
import { CodeChunker, CodeChunk } from './chunker.js';
import { ImpactGraph } from '../impact/graph.js';
import { ollamaClient } from '../embeddings/ollama.js';
import { qdrantManager } from '../vectors/qdrant.js';
import { IndexLock } from '../utils/lock.js';
import { logger } from '../utils/logger.js';

export interface IndexingResult {
  projectId: string;
  workspaceId: string;
  filesScanned: number;
  filesIndexed: number;
  filesDeleted: number;
  chunksCreated: number;
  vectorsGenerated: number;
  durationMs: number;
  errors: string[];
}

export class Indexer {
  /**
   * Executes full or incremental indexing of a project codebase.
   */
  public static async run(options: {
    projectId: string;
    workspaceId?: string;
    mode: 'full' | 'incremental';
  }): Promise<IndexingResult> {
    const startTime = Date.now();
    const project = await ProjectManager.getProject(options.projectId);
    if (!project) {
      throw new Error(`Project not found: ${options.projectId}`);
    }

    const workspace = await ProjectManager.getOrCreateWorkspace(project.id, options.workspaceId);

    // Acquire indexing lock
    const locked = IndexLock.acquire(project.id, workspace.id);
    if (!locked) {
      throw new Error(`Another indexing process is currently active for project '${project.id}' workspace '${workspace.name}'.`);
    }

    // Record job start
    const jobResult: any = await query(
      `INSERT INTO indexing_jobs (project_id, workspace_id, job_type, status)
       VALUES (?, ?, ?, 'running')`,
      [project.id, workspace.id, options.mode]
    );
    const jobId = jobResult?.insertId;

    const errors: string[] = [];
    let filesIndexed = 0;
    let filesDeleted = 0;
    let chunksCreated = 0;
    let vectorsGenerated = 0;

    try {
      logger.info({ project: project.name, mode: options.mode }, 'Starting codebase indexing...');

      // 1. Scan files
      const customExclusions = (project.config?.exclude as string[]) || [];
      const scanner = new FileScanner(project.root_path, customExclusions);
      const scannedFiles = await scanner.scan();

      // 2. Inspect Git state (for uncommitted changes)
      const gitState = await ProjectManager.detectGitState(project.root_path);
      const uncommittedSet = new Set([
        ...gitState.uncommittedFiles.modified,
        ...gitState.uncommittedFiles.created,
      ]);

      // 3. Load currently indexed files from database
      const existingDbFiles = await query<mysql.RowDataPacket[]>(
        'SELECT id, relative_path, content_hash FROM indexed_files WHERE project_id = ? AND workspace_id = ? AND is_deleted = 0',
        [project.id, workspace.id]
      );
      const dbFileMap = new Map<string, { id: number; content_hash: string }>();
      for (const row of existingDbFiles) {
        dbFileMap.set(row.relative_path as string, { id: Number(row.id), content_hash: row.content_hash as string });
      }

      // Determine added, modified, unchanged, and deleted files
      const scannedMap = new Map<string, ScannedFile>();
      const filesToProcess: ScannedFile[] = [];

      for (const file of scannedFiles) {
        scannedMap.set(file.relativePath, file);
        const existing = dbFileMap.get(file.relativePath);

        if (options.mode === 'full' || !existing || existing.content_hash !== file.contentHash) {
          filesToProcess.push(file);
        }
      }

      // Identify deleted files
      const deletedPaths: string[] = [];
      for (const [relPath] of dbFileMap) {
        if (!scannedMap.has(relPath)) {
          deletedPaths.push(relPath);
        }
      }

      // Handle deleted files: remove from DB and mark deleted
      if (deletedPaths.length > 0) {
        await withTransaction(async (conn) => {
          for (const delPath of deletedPaths) {
            const dbFile = dbFileMap.get(delPath);
            if (dbFile) {
              await conn.query('DELETE FROM code_chunks WHERE file_id = ?', [dbFile.id]);
              await conn.query('DELETE FROM symbols WHERE file_id = ?', [dbFile.id]);
              await conn.query('DELETE FROM routes WHERE file_id = ?', [dbFile.id]);
              await conn.query('DELETE FROM code_dependencies WHERE source_file_id = ?', [dbFile.id]);
              await conn.query('UPDATE indexed_files SET is_deleted = 1 WHERE id = ?', [dbFile.id]);
              filesDeleted++;
            }
          }
        });
      }

      // Process new and modified files
      for (const file of filesToProcess) {
        try {
          const content = fs.readFileSync(file.absolutePath, 'utf-8');
          const isUncommitted = uncommittedSet.has(file.relativePath) ? 1 : 0;

          // AST Parsing
          const parseResult = CodeParser.parse(content, file.relativePath, file.language);

          // Chunking
          const chunks = CodeChunker.processChunks(
            parseResult.rawChunks,
            project.id,
            workspace.id,
            file.relativePath,
            file.language
          );

          await withTransaction(async (conn) => {
            // Upsert indexed_file record
            await conn.query(
              `INSERT INTO indexed_files
                (project_id, workspace_id, relative_path, file_extension, language, content_hash, size_bytes, is_uncommitted, is_deleted, last_indexed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NOW())
               ON DUPLICATE KEY UPDATE
                 file_extension = VALUES(file_extension),
                 language = VALUES(language),
                 content_hash = VALUES(content_hash),
                 size_bytes = VALUES(size_bytes),
                 is_uncommitted = VALUES(is_uncommitted),
                 is_deleted = 0,
                 last_indexed_at = NOW()`,
              [
                project.id,
                workspace.id,
                file.relativePath,
                file.fileExtension,
                file.language,
                file.contentHash,
                file.sizeBytes,
                isUncommitted,
              ]
            );

            const [fRows] = await conn.query<mysql.RowDataPacket[]>(
              'SELECT id FROM indexed_files WHERE workspace_id = ? AND relative_path = ? LIMIT 1',
              [workspace.id, file.relativePath]
            );
            const fileId = Number(fRows[0].id);

            // Clear old chunks & symbols for this file
            await conn.query('DELETE FROM code_chunks WHERE file_id = ?', [fileId]);
            await conn.query('DELETE FROM symbols WHERE file_id = ?', [fileId]);
            await conn.query('DELETE FROM routes WHERE file_id = ?', [fileId]);
            await conn.query('DELETE FROM code_dependencies WHERE source_file_id = ?', [fileId]);

            // Insert code chunks
            for (const chunk of chunks) {
              await conn.query(
                `INSERT INTO code_chunks
                  (chunk_id, project_id, workspace_id, file_id, relative_path, symbol_name, symbol_type, parent_symbol, start_line, end_line, content, content_hash, language, embedding_status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [
                  chunk.chunkId,
                  chunk.projectId,
                  chunk.workspaceId,
                  fileId,
                  chunk.relativePath,
                  chunk.symbolName,
                  chunk.symbolType,
                  chunk.parentSymbol,
                  chunk.startLine,
                  chunk.endLine,
                  chunk.content,
                  chunk.contentHash,
                  chunk.language,
                ]
              );
              chunksCreated++;
            }

            // Insert symbols
            for (const sym of parseResult.symbols) {
              await conn.query(
                `INSERT INTO symbols
                  (project_id, workspace_id, file_id, name, kind, namespace_or_module, parent_symbol, start_line, end_line, signature, docstring, visibility)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  project.id,
                  workspace.id,
                  fileId,
                  sym.name,
                  sym.kind,
                  sym.namespaceOrModule || null,
                  sym.parentSymbol || null,
                  sym.startLine,
                  sym.endLine,
                  sym.signature || null,
                  sym.docstring || null,
                  sym.visibility || null,
                ]
              );
            }

            // Insert routes
            for (const r of parseResult.routes) {
              await conn.query(
                `INSERT INTO routes
                  (project_id, workspace_id, file_id, http_method, uri_pattern, route_name, controller, action, line_number)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  project.id,
                  workspace.id,
                  fileId,
                  r.httpMethod,
                  r.uriPattern,
                  r.routeName || null,
                  r.controller || null,
                  r.action || null,
                  r.lineNumber,
                ]
              );
            }

            // Insert dependencies
            for (const dep of parseResult.dependencies) {
              await conn.query(
                `INSERT INTO code_dependencies
                  (project_id, workspace_id, source_file_id, target_module, symbol_name, dependency_type)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                  project.id,
                  workspace.id,
                  fileId,
                  dep.targetModule,
                  dep.targetSymbol || null,
                  dep.dependencyType,
                ]
              );
            }

            // Insert schema tables & columns
            for (const tbl of parseResult.tables) {
              await conn.query(
                `INSERT INTO schema_tables (project_id, workspace_id, table_name, model_class, migration_file)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE model_class = VALUES(model_class), migration_file = VALUES(migration_file)`,
                [project.id, workspace.id, tbl.tableName, tbl.modelClass || null, tbl.migrationFile || null]
              );

              const [tblRows] = await conn.query<mysql.RowDataPacket[]>(
                'SELECT id FROM schema_tables WHERE project_id = ? AND workspace_id = ? AND table_name = ? LIMIT 1',
                [project.id, workspace.id, tbl.tableName]
              );
              const tableId = Number(tblRows[0].id);

              for (const col of tbl.columns) {
                await conn.query(
                  `INSERT INTO schema_columns (table_id, column_name, data_type, is_nullable, is_primary_key, foreign_table, foreign_column)
                   VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    tableId,
                    col.columnName,
                    col.dataType,
                    col.isNullable ? 1 : 0,
                    col.isPrimaryKey ? 1 : 0,
                    col.foreignTable || null,
                    col.foreignColumn || null,
                  ]
                );
              }
            }

            // Insert curated memory (.ai documents)
            for (const mem of parseResult.memories) {
              await conn.query(
                `INSERT INTO curated_memory (project_id, workspace_id, category, topic, rule_statement, status, source_file)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [project.id, workspace.id, mem.category, mem.topic, mem.ruleStatement, mem.status, file.relativePath]
              );
            }

            // Insert project document record if in .ai/
            if (file.relativePath.includes('.ai/')) {
              await conn.query(
                `INSERT INTO project_documents (project_id, workspace_id, doc_type, file_path, title, content, content_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  project.id,
                  workspace.id,
                  file.relativePath.split('/').pop()?.replace('.md', '') || 'general',
                  file.relativePath,
                  parseResult.rawChunks[0]?.symbolName || path.basename(file.relativePath),
                  content,
                  file.contentHash,
                ]
              );
            }
          });

          // Build graph edges from dependencies and routes
          const edges: any[] = [];
          for (const dep of parseResult.dependencies) {
            edges.push({
              sourceNode: file.relativePath,
              sourceType: 'file',
              targetNode: dep.targetModule,
              targetType: dep.dependencyType === 'renders_component' ? 'component' : 'module',
              relationship: dep.dependencyType,
              isConfirmed: true,
            });
          }
          for (const r of parseResult.routes) {
            if (r.controller) {
              edges.push({
                sourceNode: r.uriPattern,
                sourceType: 'route',
                targetNode: r.controller,
                targetType: 'controller',
                relationship: 'handles_route',
                isConfirmed: true,
              });
            }
          }
          await ImpactGraph.recordEdges(project.id, workspace.id, edges);

          // Vector embeddings generation (batching chunks)
          if (chunks.length > 0) {
            const textsToEmbed = chunks.map((c) => `${c.symbolName || ''} (${c.symbolType}) in ${c.relativePath}:\n${c.content}`);
            const embeddings = await ollamaClient.getBatchEmbeddings(textsToEmbed);

            const validPoints: any[] = [];
            for (let i = 0; i < chunks.length; i++) {
              const vector = embeddings[i];
              if (vector) {
                validPoints.push({
                  id: chunks[i].chunkId,
                  vector,
                  payload: {
                    chunk_id: chunks[i].chunkId,
                    project_id: project.id,
                    workspace_id: workspace.id,
                    relative_path: chunks[i].relativePath,
                    symbol_name: chunks[i].symbolName,
                    symbol_type: chunks[i].symbolType,
                    language: chunks[i].language,
                    start_line: chunks[i].startLine,
                    end_line: chunks[i].endLine,
                    content_preview: chunks[i].content.slice(0, 200),
                  },
                });
              }
            }

            if (validPoints.length > 0) {
              const upserted = await qdrantManager.upsertVectors(validPoints);
              if (upserted) {
                vectorsGenerated += validPoints.length;
                const pointIds = validPoints.map((p) => p.id);
                const placeholders = pointIds.map(() => '?').join(',');
                await query(
                  `UPDATE code_chunks SET embedding_status = 'synced', qdrant_point_id = chunk_id WHERE chunk_id IN (${placeholders})`,
                  pointIds
                );
              }
            }
          }

          filesIndexed++;
        } catch (err: any) {
          const errMsg = `Error indexing file '${file.relativePath}': ${err?.message || String(err)}`;
          logger.error({ err, file: file.relativePath }, errMsg);
          errors.push(errMsg);

          // Log error to error_logs table
          query(
            `INSERT INTO error_logs (project_id, file_path, error_type, message, stack_trace)
             VALUES (?, ?, 'indexing_error', ?, ?)`,
            [project.id, file.relativePath, errMsg, err?.stack || null]
          ).catch(() => {});
        }
      }

      const durationMs = Date.now() - startTime;

      // Update indexing job
      if (jobId) {
        await query(
          `UPDATE indexing_jobs SET
            status = 'completed',
            files_scanned = ?,
            files_indexed = ?,
            chunks_created = ?,
            vectors_generated = ?,
            completed_at = NOW()
           WHERE id = ?`,
          [scannedFiles.length, filesIndexed, chunksCreated, vectorsGenerated, jobId]
        );
      }

      logger.info({
        project: project.name,
        filesIndexed,
        filesDeleted,
        chunksCreated,
        vectorsGenerated,
        durationMs,
      }, 'Indexing completed successfully.');

      return {
        projectId: project.id,
        workspaceId: workspace.id,
        filesScanned: scannedFiles.length,
        filesIndexed,
        filesDeleted,
        chunksCreated,
        vectorsGenerated,
        durationMs,
        errors,
      };
    } finally {
      IndexLock.release(project.id, workspace.id);
    }
  }
}
