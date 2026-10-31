import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { SearchHit } from './types.js';

export class ExactSearch {
  /**
   * Searches for exact symbol matches in MySQL symbols and code_chunks.
   */
  public static async search(
    projectId: string,
    workspaceId: string,
    term: string,
    limit: number = 10
  ): Promise<SearchHit[]> {
    const cleanTerm = term.trim();
    if (!cleanTerm) return [];

    const words = cleanTerm
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, '').trim())
      .filter((w) => w.length >= 4);

    const conditions = ['(c.symbol_name = ? OR c.symbol_name LIKE ?)'];
    const params: any[] = [projectId, workspaceId, cleanTerm, `%${cleanTerm}%`];

    for (const w of words) {
      conditions.push('c.symbol_name LIKE ?');
      params.push(`%${w}%`);
    }

    params.push(cleanTerm, limit);

    const sql = `
      SELECT c.chunk_id, c.project_id, c.workspace_id, c.relative_path,
             c.symbol_name, c.symbol_type, c.start_line, c.end_line,
             c.content, c.language
      FROM code_chunks c
      WHERE c.project_id = ? AND c.workspace_id = ?
        AND (${conditions.join(' OR ')})
      ORDER BY (c.symbol_name = ?) DESC, c.start_line ASC
      LIMIT ?
    `;

    const rows = await query<mysql.RowDataPacket[]>(sql, params);

    return rows.map((r) => ({
      chunkId: r.chunk_id as string,
      projectId: r.project_id as string,
      workspaceId: r.workspace_id as string,
      relativePath: r.relative_path as string,
      symbolName: r.symbol_name as string | null,
      symbolType: r.symbol_type as string,
      startLine: Number(r.start_line),
      endLine: Number(r.end_line),
      content: r.content as string,
      language: r.language as string,
      score: r.symbol_name === cleanTerm ? 1.0 : 0.8,
      channel: 'exact',
      explanation: `Exact identifier match on symbol '${r.symbol_name}'`,
    }));
  }

  /**
   * Searches by file relative path.
   */
  public static async searchPath(
    projectId: string,
    workspaceId: string,
    pathPattern: string,
    limit: number = 10
  ): Promise<SearchHit[]> {
    const cleanPath = pathPattern.trim();
    if (!cleanPath) return [];

    const sql = `
      SELECT c.chunk_id, c.project_id, c.workspace_id, c.relative_path,
             c.symbol_name, c.symbol_type, c.start_line, c.end_line,
             c.content, c.language
      FROM code_chunks c
      WHERE c.project_id = ? AND c.workspace_id = ?
        AND c.relative_path LIKE ?
      ORDER BY c.start_line ASC
      LIMIT ?
    `;

    const rows = await query<mysql.RowDataPacket[]>(sql, [
      projectId,
      workspaceId,
      `%${cleanPath}%`,
      limit,
    ]);

    return rows.map((r) => ({
      chunkId: r.chunk_id as string,
      projectId: r.project_id as string,
      workspaceId: r.workspace_id as string,
      relativePath: r.relative_path as string,
      symbolName: r.symbol_name as string | null,
      symbolType: r.symbol_type as string,
      startLine: Number(r.start_line),
      endLine: Number(r.end_line),
      content: r.content as string,
      language: r.language as string,
      score: 0.9,
      channel: 'path',
      explanation: `Path match on '${r.relative_path}'`,
    }));
  }
}
