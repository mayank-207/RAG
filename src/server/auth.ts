import { Request, Response, NextFunction } from 'express';
import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { hashPassword, verifyPassword, generateSessionToken } from '../security/crypto.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface AdminUser {
  id: number;
  username: string;
  role: string;
  createdAt: string;
}

export class AuthService {
  /**
   * Ensures an admin user exists; creates default admin if none found.
   */
  public static async ensureDefaultAdmin(): Promise<void> {
    try {
      const rows = await query<mysql.RowDataPacket[]>('SELECT id FROM admin_users LIMIT 1');
      if (!rows || rows.length === 0) {
        const username = 'admin';
        const defaultPassword = config.dashboard.adminInitialPassword || 'admin123';
        const { hash, salt } = hashPassword(defaultPassword);

        await query(
          'INSERT INTO admin_users (username, password_hash, salt, role) VALUES (?, ?, ?, "admin")',
          [username, hash, salt]
        );

        logger.info({ username }, 'Created default local admin account');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to check or create default admin user');
    }
  }

  /**
   * Authenticates user credentials and creates a session token.
   */
  public static async login(username: string, password: string): Promise<{ token: string; user: AdminUser } | null> {
    const rows = await query<mysql.RowDataPacket[]>(
      'SELECT id, username, password_hash, salt, role, created_at FROM admin_users WHERE username = ? LIMIT 1',
      [username.trim()]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const userRow = rows[0] as any;
    const isValid = verifyPassword(password, userRow.password_hash, userRow.salt);
    if (!isValid) {
      return null;
    }

    // Generate session token valid for 7 days
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      'INSERT INTO admin_sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
      [token, userRow.id, expiresAt]
    );

    return {
      token,
      user: {
        id: userRow.id,
        username: userRow.username,
        role: userRow.role,
        createdAt: userRow.created_at,
      },
    };
  }

  /**
   * Validates a session token.
   */
  public static async validateSession(token: string): Promise<AdminUser | null> {
    if (!token) return null;

    const rows = await query<mysql.RowDataPacket[]>(
      `SELECT u.id, u.username, u.role, u.created_at
       FROM admin_sessions s
       JOIN admin_users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > NOW()
       LIMIT 1`,
      [token]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const r = rows[0] as any;
    return {
      id: r.id,
      username: r.username,
      role: r.role,
      createdAt: r.created_at,
    };
  }

  /**
   * Invalidates a session token.
   */
  public static async logout(token: string): Promise<void> {
    if (!token) return;
    await query('DELETE FROM admin_sessions WHERE id = ?', [token]);
  }

  /**
   * Changes the password for an admin user.
   */
  public static async changePassword(userId: number, currentPass: string, newPass: string): Promise<boolean> {
    const rows = await query<mysql.RowDataPacket[]>(
      'SELECT password_hash, salt FROM admin_users WHERE id = ? LIMIT 1',
      [userId]
    );

    if (!rows || rows.length === 0) return false;
    const r = rows[0] as any;

    if (!verifyPassword(currentPass, r.password_hash, r.salt)) {
      return false;
    }

    const { hash, salt } = hashPassword(newPass);
    await query(
      'UPDATE admin_users SET password_hash = ?, salt = ?, updated_at = NOW() WHERE id = ?',
      [hash, salt, userId]
    );

    return true;
  }
}

/**
 * Express middleware to protect API routes requiring authentication.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Extract token from Authorization header or cookie
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers.cookie) {
    const cookies = Object.fromEntries(
      req.headers.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k, v.join('=')];
      })
    );
    token = cookies['code_context_session'];
  }

  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Session required' });
    return;
  }

  const user = await AuthService.validateSession(token);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
    return;
  }

  (req as any).user = user;
  (req as any).sessionToken = token;
  next();
}

