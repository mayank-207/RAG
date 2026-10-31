import mysql from 'mysql2/promise';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

let pool: mysql.Pool | null = null;

export function getDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      waitForConnections: true,
      connectionLimit: config.db.connectionLimit,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      charset: 'utf8mb4',
      decimalNumbers: true,
      multipleStatements: true,
    });
  }
  return pool;
}

export async function query<T extends mysql.RowDataPacket[][] | mysql.RowDataPacket[] | mysql.OkPacket | mysql.OkPacket[] | mysql.ResultSetHeader>(
  sql: string,
  params?: any[]
): Promise<T> {
  const p = getDbPool();
  const [rows] = await p.query<T>(sql, params);
  return rows;
}

export async function execute<T extends mysql.ResultSetHeader | mysql.RowDataPacket[]>(
  sql: string,
  params?: any[]
): Promise<T> {
  const p = getDbPool();
  const [result] = await p.execute<T>(sql, params);
  return result;
}

export async function withTransaction<T>(callback: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const p = getDbPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function ensureDatabaseExists(): Promise<void> {
  try {
    const rootConn = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
    });
    await rootConn.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
    );
    await rootConn.end();
  } catch (err: any) {
    logger.debug({ err: err?.message }, 'Could not run CREATE DATABASE IF NOT EXISTS check');
  }
}

export async function testDbConnection(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const p = getDbPool();
    const [rows] = await p.query<mysql.RowDataPacket[]>('SELECT VERSION() as version');
    const version = rows[0]?.version as string;
    return { ok: true, version };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function closeDbPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
