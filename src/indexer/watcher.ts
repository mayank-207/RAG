import chokidar, { FSWatcher } from 'chokidar';
import path from 'node:path';
import { ProjectManager } from '../projects/manager.js';
import { Indexer } from './indexer.js';
import { FileScanner } from './scanner.js';
import { logger } from '../utils/logger.js';

export class ProjectWatcher {
  private static activeWatchers = new Map<string, FSWatcher>();

  public static async watch(projectId: string, workspaceName?: string): Promise<void> {
    const project = await ProjectManager.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    if (this.activeWatchers.has(project.id)) {
      logger.info({ project: project.name }, 'Watcher already active for project');
      return;
    }

    logger.info({ project: project.name, path: project.root_path }, 'Starting incremental file watcher...');

    let debounceTimer: NodeJS.Timeout | null = null;
    let pendingChanges = new Set<string>();

    const triggerIncremental = () => {
      if (pendingChanges.size === 0) return;
      const count = pendingChanges.size;
      pendingChanges.clear();

      logger.info({ project: project.name, fileChanges: count }, 'Triggering incremental index for detected changes...');
      Indexer.run({
        projectId: project.id,
        workspaceId: workspaceName,
        mode: 'incremental',
      }).catch((err) => {
        logger.error({ err, project: project.name }, 'Incremental watch index failed');
      });
    };

    const watcher = chokidar.watch(project.root_path, {
      ignored: [
        '**/node_modules/**',
        '**/vendor/**',
        '**/.git/**',
        '**/local-data/**',
        '**/storage/framework/**',
        '**/.env*',
        '**/*.pem',
        '**/*.key',
      ],
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    const handleChange = (filePath: string) => {
      const rel = path.relative(project.root_path, filePath);
      if (FileScanner.isSecret(rel)) return;

      pendingChanges.add(rel);
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(triggerIncremental, 500);
    };

    watcher.on('add', handleChange);
    watcher.on('change', handleChange);
    watcher.on('unlink', handleChange);

    this.activeWatchers.set(project.id, watcher);
  }

  public static stopWatch(projectId: string): void {
    const watcher = this.activeWatchers.get(projectId);
    if (watcher) {
      watcher.close();
      this.activeWatchers.delete(projectId);
      logger.info({ projectId }, 'Watcher stopped.');
    }
  }
}
