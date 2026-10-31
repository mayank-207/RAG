import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { logger } from './logger.js';

export class IndexLock {
  private static getLockFilePath(projectId: string, workspaceId: string): string {
    const lockDir = path.join(config.localDataDir, 'indexing', 'locks');
    fs.mkdirSync(lockDir, { recursive: true });
    return path.join(lockDir, `${projectId}_${workspaceId}.lock`);
  }

  /**
   * Attempts to acquire an indexing lock.
   * Stale locks older than 30 minutes are considered expired and cleared.
   */
  public static acquire(projectId: string, workspaceId: string): boolean {
    const lockFile = this.getLockFilePath(projectId, workspaceId);

    if (fs.existsSync(lockFile)) {
      try {
        const stats = fs.statSync(lockFile);
        const ageMs = Date.now() - stats.mtimeMs;
        let pidAlive = true;

        try {
          const lockData = JSON.parse(fs.readFileSync(lockFile, 'utf-8'));
          if (lockData.pid === process.pid) {
            pidAlive = false; // Reclaim in same process
          } else {
            process.kill(lockData.pid, 0);
          }
        } catch {
          pidAlive = false;
        }

        // Stale threshold or dead PID
        if (ageMs > 30 * 60 * 1000 || !pidAlive) {
          logger.warn({ projectId, workspaceId }, 'Clearing stale indexing lock');
          fs.unlinkSync(lockFile);
        } else {
          logger.warn({ projectId, workspaceId }, 'Active indexing lock already held');
          return false;
        }
      } catch (err) {
        logger.error({ err }, 'Error checking lock file');
        return false;
      }
    }

    try {
      fs.writeFileSync(lockFile, JSON.stringify({
        projectId,
        workspaceId,
        pid: process.pid,
        time: new Date().toISOString(),
      }), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Releases an indexing lock.
   */
  public static release(projectId: string, workspaceId: string): void {
    const lockFile = this.getLockFilePath(projectId, workspaceId);
    try {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
      }
    } catch (err) {
      logger.error({ err, projectId, workspaceId }, 'Failed to release index lock');
    }
  }
}
