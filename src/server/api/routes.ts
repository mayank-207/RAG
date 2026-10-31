import express, { Request, Response, Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { query, testDbConnection } from '../../db/connection.js';
import { ProjectManager } from '../../projects/manager.js';
import { Indexer } from '../../indexer/indexer.js';
import { aiManager } from '../../ai/manager.js';
import { ollamaClient } from '../../embeddings/ollama.js';
import { qdrantManager } from '../../vectors/qdrant.js';
import { config } from '../../config/index.js';
import { AuthService, requireAuth } from '../auth.js';
import { logger } from '../../utils/logger.js';
import { FileScanner } from '../../indexer/scanner.js';
import { CodeParser } from '../../parsers/index.js';
import { CodeChunker } from '../../indexer/chunker.js';

export const apiRouter = Router();

// ==============================================================================
// 1. Authentication Endpoints
// ==============================================================================

apiRouter.post('/auth/login', async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password are required' });
    return;
  }

  const result = await AuthService.login(username, password);
  if (!result) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  // Set secure cookie
  res.cookie('code_context_session', result.token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ token: result.token, user: result.user });
});

apiRouter.post('/auth/logout', requireAuth, async (req: Request, res: Response) => {
  const token = (req as any).sessionToken;
  await AuthService.logout(token);
  res.clearCookie('code_context_session');
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, async (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

apiRouter.post('/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  const user = (req as any).user;

  if (!currentPassword || !newPassword || newPassword.length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  const ok = await AuthService.changePassword(user.id, currentPassword, newPassword);
  if (!ok) {
    res.status(400).json({ error: 'Current password is incorrect' });
    return;
  }

  res.json({ ok: true, message: 'Password updated successfully' });
});

// All subsequent API endpoints require authentication
apiRouter.use(requireAuth);

// ==============================================================================
// 2. Dashboard Summary Stats
// ==============================================================================

apiRouter.get('/dashboard/stats', async (req: Request, res: Response) => {
  try {
    const projects = await ProjectManager.listProjects();

    let totalConnected = 0;
    let totalIndexed = 0;
    let pendingProjects = 0;

    for (const p of projects) {
      if (fs.existsSync(p.root_path)) totalConnected++;
      if (p.file_count > 0) totalIndexed++;
      else pendingProjects++;
    }

    // Counts from database
    const fileCountRows = await query<any[]>('SELECT COUNT(*) as count FROM indexed_files WHERE is_deleted = 0');
    const chunkCountRows = await query<any[]>('SELECT COUNT(*) as count FROM code_chunks');
    const symbolCountRows = await query<any[]>('SELECT COUNT(*) as count FROM symbols');
    const embeddingCountRows = await query<any[]>("SELECT COUNT(*) as count FROM code_chunks WHERE embedding_status = 'synced'");
    const lastIndexRows = await query<any[]>('SELECT MAX(completed_at) as last_time FROM indexing_jobs WHERE status = "completed"');
    const errorProjectRows = await query<any[]>('SELECT COUNT(DISTINCT project_id) as count FROM error_logs WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)');

    // Service health
    const [mysqlHealth, qdrantHealth, ollamaHealth] = await Promise.all([
      testDbConnection(),
      qdrantManager.checkHealth(),
      ollamaClient.checkHealth(),
    ]);

    // Active AI model assignment
    const assignments = await aiManager.getModelAssignments();
    const activeModel = assignments.find((a) => a.task_type === 'code_analysis')?.model_name || 'nomic-embed-text';

    res.json({
      summary: {
        totalRegisteredProjects: projects.length,
        totalConnectedProjects: totalConnected,
        totalIndexedProjects: totalIndexed,
        projectsPendingIndexing: pendingProjects,
        projectsWithErrors: Number(errorProjectRows[0]?.count || 0),
        totalIndexedFiles: Number(fileCountRows[0]?.count || 0),
        totalCodeChunks: Number(chunkCountRows[0]?.count || 0),
        totalIndexedSymbols: Number(symbolCountRows[0]?.count || 0),
        totalEmbeddingsGenerated: Number(embeddingCountRows[0]?.count || 0),
        lastSuccessfulIndexingTime: lastIndexRows[0]?.last_time || null,
        activeAIModel: activeModel,
        mcpServerStatus: 'ready',
      },
      services: {
        mysql: {
          status: mysqlHealth.ok ? 'connected' : 'disconnected',
          version: mysqlHealth.version,
          error: mysqlHealth.error,
        },
        qdrant: {
          status: qdrantHealth.ok ? 'connected' : 'disconnected',
          collectionsCount: qdrantHealth.collections.length,
          error: qdrantHealth.error,
        },
        ollama: {
          status: ollamaHealth.ok ? 'connected' : 'disconnected',
          modelAvailable: ollamaHealth.modelAvailable,
          error: ollamaHealth.error,
        },
        mcp: {
          status: 'connected',
          transport: 'stdio',
          serverName: config.mcp.serverName,
          version: config.mcp.serverVersion,
        },
      },
    });
  } catch (err: any) {
    logger.error({ err }, 'Error building dashboard stats');
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 3. Projects API
// ==============================================================================

apiRouter.get('/projects', async (req: Request, res: Response) => {
  const projects = await ProjectManager.listProjects();

  const enriched = await Promise.all(
    projects.map(async (p) => {
      const gitState = await ProjectManager.detectGitState(p.root_path);
      const isPathValid = fs.existsSync(p.root_path);

      const wsRows = await query<any[]>('SELECT COUNT(*) as count FROM workspaces WHERE project_id = ?', [p.id]);
      const symRows = await query<any[]>('SELECT COUNT(*) as count FROM symbols WHERE project_id = ?', [p.id]);
      const embRows = await query<any[]>("SELECT COUNT(*) as count FROM code_chunks WHERE project_id = ? AND embedding_status = 'synced'", [p.id]);

      let indexingStatus: 'indexed' | 'pending' | 'failed' | 'disconnected' = 'pending';
      if (!isPathValid) indexingStatus = 'disconnected';
      else if (p.file_count > 0) indexingStatus = 'indexed';

      return {
        ...p,
        isPathValid,
        gitBranch: gitState.currentBranch,
        latestCommit: gitState.commitHash,
        uncommittedChangesCount:
          gitState.uncommittedFiles.modified.length +
          gitState.uncommittedFiles.created.length +
          gitState.uncommittedFiles.deleted.length,
        workspaceCount: Number(wsRows[0]?.count || 1),
        symbolCount: Number(symRows[0]?.count || 0),
        embeddingCount: Number(embRows[0]?.count || 0),
        indexingStatus,
      };
    })
  );

  res.json({ projects: enriched });
});

apiRouter.post('/projects', async (req: Request, res: Response) => {
  try {
    const { id, name, rootPath, description, framework, primaryLanguage, defaultBranch } = req.body;
    if (!name || !rootPath) {
      res.status(400).json({ error: 'Project name and root path are required' });
      return;
    }

    const result = await ProjectManager.registerProject({
      id,
      name,
      rootPath,
      description,
      framework,
      primaryLanguage,
      defaultBranch,
    });

    res.status(201).json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/projects/:id', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const project = await ProjectManager.getProject(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const gitState = await ProjectManager.detectGitState(project.root_path);
    const workspaces = await query<any[]>('SELECT * FROM workspaces WHERE project_id = ?', [project.id]);

    const fileCountRows = await query<any[]>('SELECT COUNT(*) as count FROM indexed_files WHERE project_id = ? AND is_deleted = 0', [project.id]);
    const chunkCountRows = await query<any[]>('SELECT COUNT(*) as count FROM code_chunks WHERE project_id = ?', [project.id]);
    const symbolCountRows = await query<any[]>('SELECT COUNT(*) as count FROM symbols WHERE project_id = ?', [project.id]);
    const routeCountRows = await query<any[]>('SELECT COUNT(*) as count FROM routes WHERE project_id = ?', [project.id]);
    const tableCountRows = await query<any[]>('SELECT COUNT(*) as count FROM schema_tables WHERE project_id = ?', [project.id]);

    const jobs = await query<any[]>('SELECT * FROM indexing_jobs WHERE project_id = ? ORDER BY started_at DESC LIMIT 10', [project.id]);
    const errors = await query<any[]>('SELECT * FROM error_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 10', [project.id]);

    res.json({
      project,
      gitState,
      workspaces,
      stats: {
        files: Number(fileCountRows[0]?.count || 0),
        chunks: Number(chunkCountRows[0]?.count || 0),
        symbols: Number(symbolCountRows[0]?.count || 0),
        routes: Number(routeCountRows[0]?.count || 0),
        tables: Number(tableCountRows[0]?.count || 0),
      },
      jobs,
      errors,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.put('/projects/:id', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const updated = await ProjectManager.updateProject(projectId, req.body);
    res.json(updated);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.delete('/projects/:id', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const purgeIndexOnly = req.query.purgeIndexOnly === 'true';
    await ProjectManager.removeProject(projectId, purgeIndexOnly);
    res.json({ ok: true, purgeIndexOnly });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.post('/projects/:id/index', async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const mode = req.body.mode === 'incremental' ? 'incremental' : 'full';
    const workspaceId = req.body.workspaceId;

    // Trigger indexing
    const result = await Indexer.run({
      projectId,
      workspaceId,
      mode,
    });

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 4. Indexed Files API
// ==============================================================================

apiRouter.get('/files', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const extension = req.query.extension as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    let sql = 'SELECT f.*, p.name as project_name FROM indexed_files f JOIN projects p ON p.id = f.project_id WHERE f.is_deleted = 0';
    const params: any[] = [];

    if (projectId) {
      sql += ' AND f.project_id = ?';
      params.push(projectId);
    }
    if (extension) {
      sql += ' AND f.file_extension = ?';
      params.push(extension);
    }
    if (search) {
      sql += ' AND f.relative_path LIKE ?';
      params.push(`%${search}%`);
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) AS sub`;
    const countRows = await query<any[]>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    sql += ' ORDER BY f.last_indexed_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await query<any[]>(sql, params);
    res.json({ files: rows, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/files/:id', async (req: Request, res: Response) => {
  try {
    const fileRows = await query<any[]>(
      'SELECT f.*, p.name as project_name, p.root_path FROM indexed_files f JOIN projects p ON p.id = f.project_id WHERE f.id = ? LIMIT 1',
      [req.params.id]
    );

    if (!fileRows || fileRows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = fileRows[0];
    const chunks = await query<any[]>('SELECT * FROM code_chunks WHERE file_id = ? ORDER BY start_line ASC', [file.id]);
    const symbols = await query<any[]>('SELECT * FROM symbols WHERE file_id = ? ORDER BY start_line ASC', [file.id]);

    let rawContent: string | null = null;
    const fullDiskPath = path.resolve(file.root_path, file.relative_path);
    if (fs.existsSync(fullDiskPath)) {
      try {
        rawContent = fs.readFileSync(fullDiskPath, 'utf-8');
      } catch {}
    }

    res.json({ file, chunks, symbols, rawContent });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.post('/files/:id/reindex', async (req: Request, res: Response) => {
  try {
    const fileRows = await query<any[]>(
      'SELECT f.*, p.root_path FROM indexed_files f JOIN projects p ON p.id = f.project_id WHERE f.id = ? LIMIT 1',
      [req.params.id]
    );

    if (!fileRows || fileRows.length === 0) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    const file = fileRows[0];
    const fullDiskPath = path.resolve(file.root_path, file.relative_path);
    if (!fs.existsSync(fullDiskPath)) {
      res.status(400).json({ error: 'File no longer exists on disk' });
      return;
    }

    const content = fs.readFileSync(fullDiskPath, 'utf-8');
    const parseResult = CodeParser.parse(content, file.relative_path, file.language);
    const chunks = CodeChunker.processChunks(parseResult.rawChunks, file.project_id, file.workspace_id, file.relative_path, file.language);

    // Update DB
    await query('DELETE FROM code_chunks WHERE file_id = ?', [file.id]);
    await query('DELETE FROM symbols WHERE file_id = ?', [file.id]);

    for (const chunk of chunks) {
      await query(
        `INSERT INTO code_chunks
          (chunk_id, project_id, workspace_id, file_id, relative_path, symbol_name, symbol_type, parent_symbol, start_line, end_line, content, content_hash, language, embedding_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          chunk.chunkId,
          chunk.projectId,
          chunk.workspaceId,
          file.id,
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
    }

    for (const sym of parseResult.symbols) {
      await query(
        `INSERT INTO symbols
          (project_id, workspace_id, file_id, name, kind, namespace_or_module, parent_symbol, start_line, end_line, signature, docstring, visibility)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          file.project_id,
          file.workspace_id,
          file.id,
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

    await query('UPDATE indexed_files SET last_indexed_at = NOW() WHERE id = ?', [file.id]);

    res.json({ ok: true, chunksCount: chunks.length, symbolsCount: parseResult.symbols.length });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 5. Code Chunks & Symbols API
// ==============================================================================

apiRouter.get('/chunks', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const symbolType = req.query.symbolType as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 30, 100);
    const offset = Number(req.query.offset) || 0;

    let sql = 'SELECT id, chunk_id, project_id, workspace_id, relative_path, symbol_name, symbol_type, parent_symbol, start_line, end_line, language, embedding_status, created_at, SUBSTRING(content, 1, 200) as preview FROM code_chunks WHERE 1=1';
    const params: any[] = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (symbolType) {
      sql += ' AND symbol_type = ?';
      params.push(symbolType);
    }
    if (search) {
      sql += ' AND (symbol_name LIKE ? OR relative_path LIKE ? OR content LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM (${sql}) AS sub`;
    const countRows = await query<any[]>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await query<any[]>(sql, params);
    res.json({ chunks: rows, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/chunks/:id', async (req: Request, res: Response) => {
  try {
    const rows = await query<any[]>('SELECT * FROM code_chunks WHERE id = ? OR chunk_id = ? LIMIT 1', [req.params.id, req.params.id]);
    if (!rows || rows.length === 0) {
      res.status(404).json({ error: 'Chunk not found' });
      return;
    }
    res.json({ chunk: rows[0] });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/symbols', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const kind = req.query.kind as string | undefined;
    const search = req.query.search as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    let sql = 'SELECT s.*, f.relative_path FROM symbols s JOIN indexed_files f ON f.id = s.file_id WHERE 1=1';
    const params: any[] = [];

    if (projectId) {
      sql += ' AND s.project_id = ?';
      params.push(projectId);
    }
    if (kind) {
      sql += ' AND s.kind = ?';
      params.push(kind);
    }
    if (search) {
      sql += ' AND (s.name LIKE ? OR s.signature LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM (${sql}) AS sub`;
    const countRows = await query<any[]>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    sql += ' ORDER BY s.name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = await query<any[]>(sql, params);
    res.json({ symbols: rows, total, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/dependencies', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    const search = req.query.search as string | undefined;

    let sql = 'SELECT * FROM dependency_graph_edges WHERE 1=1';
    const params: any[] = [];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }
    if (search) {
      sql += ' AND (source_node LIKE ? OR target_node LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY id DESC LIMIT 100';
    const rows = await query<any[]>(sql, params);
    res.json({ dependencies: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 6. Indexing Jobs API
// ==============================================================================

apiRouter.get('/indexing/jobs', async (req: Request, res: Response) => {
  try {
    const projectId = req.query.projectId as string | undefined;
    let sql = 'SELECT j.*, p.name as project_name FROM indexing_jobs j JOIN projects p ON p.id = j.project_id WHERE 1=1';
    const params: any[] = [];

    if (projectId) {
      sql += ' AND j.project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY j.started_at DESC LIMIT 50';
    const rows = await query<any[]>(sql, params);
    res.json({ jobs: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 7. AI Model Providers API
// ==============================================================================

apiRouter.get('/ai/providers', async (req: Request, res: Response) => {
  try {
    const providers = await aiManager.listProviders();
    res.json({ providers });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.post('/ai/providers', async (req: Request, res: Response) => {
  try {
    const saved = await aiManager.saveProvider(req.body);
    res.status(201).json(saved);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.post('/ai/providers/:id/test', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.id);
    const result = await aiManager.testProviderConnection(providerId, req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || String(err) });
  }
});

apiRouter.get('/ai/providers/:id/models', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.id);
    const models = await aiManager.listProviderModels(providerId);
    res.json({ models });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.delete('/ai/providers/:id', async (req: Request, res: Response) => {
  try {
    const providerId = String(req.params.id);
    await aiManager.deleteProvider(providerId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/ai/assignments', async (req: Request, res: Response) => {
  try {
    const assignments = await aiManager.getModelAssignments();
    res.json({ assignments });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.put('/ai/assignments', async (req: Request, res: Response) => {
  try {
    const { taskType, providerId, modelName } = req.body;
    await aiManager.setModelAssignment(taskType, providerId, modelName);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/ai/embedding-settings', async (req: Request, res: Response) => {
  try {
    const settings = await aiManager.getEmbeddingSettings();
    res.json({ settings });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.put('/ai/embedding-settings', async (req: Request, res: Response) => {
  try {
    const result = await aiManager.updateEmbeddingSettings(req.body);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || String(err) });
  }
});

// ==============================================================================
// 8. System Diagnostics API
// ==============================================================================

apiRouter.get('/system/settings', async (req: Request, res: Response) => {
  try {
    const [mysqlHealth, qdrantHealth, ollamaHealth] = await Promise.all([
      testDbConnection(),
      qdrantManager.checkHealth(),
      ollamaClient.checkHealth(),
    ]);

    // Local storage paths
    const storageInfo = {
      dataDir: config.localDataDir,
      logsDir: path.join(config.localDataDir, 'logs'),
      cacheDir: path.join(config.localDataDir, 'cache'),
      dataDirExists: fs.existsSync(config.localDataDir),
    };

    res.json({
      mysql: {
        host: config.db.host,
        port: config.db.port,
        database: config.db.database,
        user: config.db.user,
        connected: mysqlHealth.ok,
        version: mysqlHealth.version,
        error: mysqlHealth.error,
      },
      qdrant: {
        url: config.qdrant.url,
        connected: qdrantHealth.ok,
        collections: qdrantHealth.collections,
        error: qdrantHealth.error,
      },
      ollama: {
        url: config.ollama.url,
        connected: ollamaHealth.ok,
        model: config.ollama.model,
        dimensions: config.ollama.dimensions,
        modelAvailable: ollamaHealth.modelAvailable,
        availableModels: ollamaHealth.availableModels,
        error: ollamaHealth.error,
      },
      mcp: {
        serverName: config.mcp.serverName,
        version: config.mcp.serverVersion,
        transport: 'stdio',
        tools: ['get_task_context', 'search_code', 'get_impact', 'index_status'],
      },
      storage: storageInfo,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

apiRouter.get('/logs', async (req: Request, res: Response) => {
  try {
    const errors = await query<any[]>('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 50');
    const retrievals = await query<any[]>('SELECT * FROM retrieval_logs ORDER BY created_at DESC LIMIT 50');
    res.json({ errors, retrievals });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});
