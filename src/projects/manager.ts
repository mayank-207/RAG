import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { simpleGit, SimpleGit } from 'simple-git';
import { query, withTransaction } from '../db/connection.js';
import { normalizePath, assertSafePath } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export interface ProjectRecord {
  id: string;
  name: string;
  root_path: string;
  description: string | null;
  primary_language: string;
  framework: string | null;
  default_branch: string;
  config: any;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceRecord {
  id: string;
  project_id: string;
  name: string;
  type: 'branch' | 'working_copy' | 'commit_snapshot';
  git_branch: string | null;
  git_commit_hash: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GitState {
  isGit: boolean;
  currentBranch: string;
  commitHash: string | null;
  uncommittedFiles: {
    modified: string[];
    created: string[];
    deleted: string[];
    renamed: { from: string; to: string }[];
  };
}

export class ProjectManager {
  /**
   * Inspects local Git repository state safely without modifying anything.
   */
  public static async detectGitState(projectPath: string): Promise<GitState> {
    const gitDir = path.join(projectPath, '.git');
    if (!fs.existsSync(gitDir)) {
      return {
        isGit: false,
        currentBranch: 'main',
        commitHash: null,
        uncommittedFiles: { modified: [], created: [], deleted: [], renamed: [] },
      };
    }

    try {
      const git: SimpleGit = simpleGit(projectPath);
      const isRepo = await git.checkIsRepo();
      if (!isRepo) {
        return {
          isGit: false,
          currentBranch: 'main',
          commitHash: null,
          uncommittedFiles: { modified: [], created: [], deleted: [], renamed: [] },
        };
      }

      const status = await git.status();
      const log = await git.log({ maxCount: 1 }).catch(() => null);

      return {
        isGit: true,
        currentBranch: status.current || 'main',
        commitHash: log?.latest?.hash || null,
        uncommittedFiles: {
          modified: status.modified.map(normalizePath),
          created: [...status.not_added, ...status.created].map(normalizePath),
          deleted: status.deleted.map(normalizePath),
          renamed: status.renamed.map((r) => ({ from: normalizePath(r.from), to: normalizePath(r.to) })),
        },
      };
    } catch (err) {
      logger.warn({ err, projectPath }, 'Unable to read Git status, falling back to non-git state');
      return {
        isGit: false,
        currentBranch: 'main',
        commitHash: null,
        uncommittedFiles: { modified: [], created: [], deleted: [], renamed: [] },
      };
    }
  }

  /**
   * Registers a new project codebase.
   */
  public static async registerProject(params: {
    id?: string;
    name: string;
    rootPath: string;
    description?: string;
    primaryLanguage?: string;
    framework?: string;
    defaultBranch?: string;
    config?: any;
  }): Promise<{ project: ProjectRecord; workspace: WorkspaceRecord }> {
    const resolvedPath = path.resolve(params.rootPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Directory does not exist: ${resolvedPath}`);
    }

    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      throw new Error(`Target path is not a directory: ${resolvedPath}`);
    }

    // Auto-detect framework/language if not specified
    let framework = params.framework || null;
    let lang = params.primaryLanguage || 'auto';

    if (!framework) {
      if (fs.existsSync(path.join(resolvedPath, 'artisan')) || fs.existsSync(path.join(resolvedPath, 'composer.json'))) {
        framework = 'laravel';
        lang = 'php';
      } else if (fs.existsSync(path.join(resolvedPath, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(resolvedPath, 'package.json'), 'utf-8'));
        if (pkg.dependencies?.react || pkg.devDependencies?.react) {
          framework = 'react';
        } else if (pkg.dependencies?.express || pkg.dependencies?.fastify || pkg.dependencies?.koa) {
          framework = 'node';
        }
        lang = fs.existsSync(path.join(resolvedPath, 'tsconfig.json')) ? 'typescript' : 'javascript';
      }
    }

    const gitState = await this.detectGitState(resolvedPath);
    const id = (params.id || params.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')) || 'project';
    const defaultBranch = params.defaultBranch || gitState.currentBranch || 'main';

    const normalizedRoot = normalizePath(resolvedPath);

    return await withTransaction(async (conn) => {
      // Check if project already exists by id or root_path
      const [existingRows] = await conn.query<mysql.RowDataPacket[]>(
        'SELECT id FROM projects WHERE id = ? OR root_path = ? LIMIT 1',
        [id, normalizedRoot]
      );

      const actualId = existingRows && existingRows.length > 0 ? (existingRows[0].id as string) : id;

      if (existingRows && existingRows.length > 0) {
        await conn.query(
          `UPDATE projects SET
             name = ?, root_path = ?, description = ?, primary_language = ?, framework = ?, default_branch = ?, config = ?
           WHERE id = ?`,
          [
            params.name,
            normalizedRoot,
            params.description || null,
            lang,
            framework,
            defaultBranch,
            params.config ? JSON.stringify(params.config) : null,
            actualId,
          ]
        );
      } else {
        await conn.query(
          `INSERT INTO projects (id, name, root_path, description, primary_language, framework, default_branch, config)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            actualId,
            params.name,
            normalizedRoot,
            params.description || null,
            lang,
            framework,
            defaultBranch,
            params.config ? JSON.stringify(params.config) : null,
          ]
        );
      }

      // Create default working copy workspace
      const workspaceId = `${actualId}:working-copy`;
      await conn.query(
        `INSERT INTO workspaces (id, project_id, name, type, git_branch, git_commit_hash, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           git_branch = VALUES(git_branch),
           git_commit_hash = VALUES(git_commit_hash),
           is_active = 1`,
        [workspaceId, actualId, 'working-copy', 'working_copy', gitState.currentBranch, gitState.commitHash, 1]
      );

      const [projRows] = await conn.query<mysql.RowDataPacket[]>('SELECT * FROM projects WHERE id = ?', [actualId]);
      const [wsRows] = await conn.query<mysql.RowDataPacket[]>('SELECT * FROM workspaces WHERE id = ?', [workspaceId]);

      return {
        project: projRows[0] as ProjectRecord,
        workspace: wsRows[0] as WorkspaceRecord,
      };
    });
  }

  /**
   * Retrieves a project by ID or exact name.
   */
  public static async getProject(projectIdOrName: string): Promise<ProjectRecord | null> {
    const rows = await query<mysql.RowDataPacket[]>(
      'SELECT * FROM projects WHERE id = ? OR name = ? LIMIT 1',
      [projectIdOrName, projectIdOrName]
    );
    if (!rows || rows.length === 0) return null;
    return rows[0] as ProjectRecord;
  }

  /**
   * Lists all registered projects with indexing stats.
   */
  public static async listProjects(): Promise<Array<ProjectRecord & { file_count: number; chunk_count: number; last_indexed: string | null }>> {
    const sql = `
      SELECT p.*,
        COALESCE(COUNT(DISTINCT f.id), 0) AS file_count,
        COALESCE(COUNT(DISTINCT c.id), 0) AS chunk_count,
        MAX(f.last_indexed_at) AS last_indexed
      FROM projects p
      LEFT JOIN indexed_files f ON f.project_id = p.id AND f.is_deleted = 0
      LEFT JOIN code_chunks c ON c.project_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
    const rows = await query<mysql.RowDataPacket[]>(sql);
    return rows as any;
  }

  /**
   * Updates project configuration.
   */
  public static async updateProject(projectId: string, updates: {
    name?: string;
    description?: string;
    primaryLanguage?: string;
    framework?: string;
    defaultBranch?: string;
    config?: any;
  }): Promise<ProjectRecord> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const name = updates.name !== undefined ? updates.name : existing.name;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const lang = updates.primaryLanguage !== undefined ? updates.primaryLanguage : existing.primary_language;
    const framework = updates.framework !== undefined ? updates.framework : existing.framework;
    const defaultBranch = updates.defaultBranch !== undefined ? updates.defaultBranch : existing.default_branch;
    const config = updates.config !== undefined ? JSON.stringify(updates.config) : (existing.config ? JSON.stringify(existing.config) : null);

    await query(
      `UPDATE projects SET
        name = ?, description = ?, primary_language = ?, framework = ?, default_branch = ?, config = ?
       WHERE id = ?`,
      [name, description, lang, framework, defaultBranch, config, projectId]
    );

    const updated = await this.getProject(projectId);
    return updated!;
  }

  /**
   * Removes a project.
   * If purgeIndexOnly is true, removes all indexed files, chunks, symbols, routes, and memory
   * but keeps the project registration intact.
   * If purgeIndexOnly is false, removes the project registration and all dependent data.
   * NEVER touches the actual source code on disk!
   */
  public static async removeProject(projectId: string, purgeIndexOnly: boolean = false): Promise<void> {
    const existing = await this.getProject(projectId);
    if (!existing) {
      throw new Error(`Project not found: ${projectId}`);
    }

    await withTransaction(async (conn) => {
      // Delete child data
      await conn.query('DELETE FROM code_chunks WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM symbols WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM code_dependencies WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM routes WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM schema_tables WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM dependency_graph_edges WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM project_documents WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM curated_memory WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM indexed_files WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM indexing_jobs WHERE project_id = ?', [projectId]);
      await conn.query('DELETE FROM retrieval_logs WHERE project_id = ?', [projectId]);

      if (!purgeIndexOnly) {
        await conn.query('DELETE FROM workspaces WHERE project_id = ?', [projectId]);
        await conn.query('DELETE FROM project_permissions WHERE project_id = ?', [projectId]);
        await conn.query('DELETE FROM projects WHERE id = ?', [projectId]);
        logger.info({ projectId }, 'Project registration and all associated index data removed.');
      } else {
        logger.info({ projectId }, 'Project index data purged. Project registration preserved.');
      }
    });
  }

  /**
   * Resolves or creates a workspace for the project.
   */
  public static async getOrCreateWorkspace(projectId: string, workspaceName?: string): Promise<WorkspaceRecord> {
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const input = workspaceName || 'working-copy';
    const name = input.startsWith(`${project.id}:`) ? input.slice(project.id.length + 1) : input;
    const workspaceId = `${project.id}:${name}`;

    const existing = await query<mysql.RowDataPacket[]>(
      'SELECT * FROM workspaces WHERE id = ? OR (project_id = ? AND name = ?) LIMIT 1',
      [workspaceId, project.id, name]
    );

    if (existing && existing.length > 0) {
      return existing[0] as WorkspaceRecord;
    }

    const gitState = await this.detectGitState(project.root_path);
    const type = name === 'working-copy' ? 'working_copy' : 'branch';

    await query(
      `INSERT INTO workspaces (id, project_id, name, type, git_branch, git_commit_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [workspaceId, project.id, name, type, gitState.currentBranch, gitState.commitHash]
    );

    const created = await query<mysql.RowDataPacket[]>('SELECT * FROM workspaces WHERE id = ?', [workspaceId]);
    return created[0] as WorkspaceRecord;
  }
}
