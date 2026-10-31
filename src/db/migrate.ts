import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { getDbPool, query } from './connection.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MigrationRecord {
  id: number;
  name: string;
  batch: number;
  executed_at: string;
}

function getMigrationsDirectory(): string {
  const localDir = path.join(__dirname, 'migrations');
  if (fs.existsSync(localDir)) {
    return localDir;
  }
  const srcDir = path.resolve(process.cwd(), 'src', 'db', 'migrations');
  if (fs.existsSync(srcDir)) {
    return srcDir;
  }
  return localDir;
}

export async function initMigrationTable(): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS migrations (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      batch INT UNSIGNED NOT NULL,
      executed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `;
  await query(sql);
}

export async function getMigrationStatus(): Promise<{ executed: MigrationRecord[]; pending: string[] }> {
  await initMigrationTable();
  const executed = await query<mysql.RowDataPacket[]>('SELECT id, name, batch, executed_at FROM migrations ORDER BY id ASC') as MigrationRecord[];
  const executedNames = new Set(executed.map((m) => m.name));

  const migrationsDir = getMigrationsDirectory();
  if (!fs.existsSync(migrationsDir)) {
    return { executed, pending: [] };
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const pending = files.filter((f) => !executedNames.has(f));
  return { executed, pending };
}

export async function runMigrations(): Promise<{ applied: string[]; errors: string[] }> {
  await initMigrationTable();
  const { executed, pending } = await getMigrationStatus();

  if (pending.length === 0) {
    logger.info('Database schema is up to date. No pending migrations.');
    return { applied: [], errors: [] };
  }

  const nextBatch = (executed.reduce((max, m) => Math.max(max, m.batch), 0)) + 1;
  const applied: string[] = [];
  const errors: string[] = [];

  const migrationsDir = getMigrationsDirectory();

  for (const filename of pending) {
    const filePath = path.join(migrationsDir, filename);
    const sqlContent = fs.readFileSync(filePath, 'utf-8');

    logger.info({ migration: filename, batch: nextBatch }, 'Applying migration...');
    const pool = getDbPool();
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      // Strip comments and split by semicolon
      const cleanedSql = sqlContent.replace(/^--.*$/gm, '').trim();
      const statements = cleanedSql
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        if (statement.trim()) {
          await conn.query(statement);
        }
      }

      await conn.query('INSERT INTO migrations (name, batch) VALUES (?, ?)', [filename, nextBatch]);
      await conn.commit();
      applied.push(filename);
      logger.info({ migration: filename }, 'Migration applied successfully.');
    } catch (err: any) {
      await conn.rollback();
      const msg = `Failed to apply migration ${filename}: ${err?.message || String(err)}`;
      logger.error({ err, migration: filename }, msg);
      errors.push(msg);
      break; // Stop running further migrations on error
    } finally {
      conn.release();
    }
  }

  return { applied, errors };
}
