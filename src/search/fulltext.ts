import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { SearchHit } from './types.js';

export class FulltextSearch {
  /**
   * Executes MySQL 8.4 FULLTEXT search across indexed code chunks.
   */
  public static async search(
    projectId: string,
    workspaceId: string,
    searchQuery: string,
    limit: number = 10
  ): Promise<SearchHit[]> {
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery) return [];

    // Extract alphanumeric terms for search
    const terms = cleanQuery.replace(/[^\w\s]/g, ' ').trim();
    if (!terms) return [];

    const sql = `
      SELECT c.chunk_id, c.project_id, c.workspace_id, c.relative_path,
             c.symbol_name, c.symbol_type, c.start_line, c.end_line,
             c.content, c.language,
             MATCH(c.content, c.symbol_name) AGAINST(? IN NATURAL LANGUAGE MODE) AS ft_score
      FROM code_chunks c
      WHERE c.project_id = ? AND c.workspace_id = ?
        AND MATCH(c.content, c.symbol_name) AGAINST(? IN NATURAL LANGUAGE MODE)
      ORDER BY ft_score DESC
      LIMIT ?
    `;

    try {
      const rows = await query<mysql.RowDataPacket[]>(sql, [
        terms,
        projectId,
        workspaceId,
        terms,
        limit,
      ]);

      if (rows.length > 0) {
        const maxScore = (rows[0].ft_score as number) || 1.0;
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
          score: Math.min(1.0, (Number(r.ft_score) || 0) / maxScore),
          channel: 'fulltext',
          explanation: `MySQL FULLTEXT match (score: ${Number(r.ft_score).toFixed(2)})`,
        }));
      }
    } catch {
      // Ignored, proceed to keyword fallback
    }

    // Keyword fallback: match significant terms (length >= 4)
    const words = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, '').trim())
      .filter((w) => w.length >= 4);

    if (words.length > 0) {
      const orClauses = words.map(() => '(c.content LIKE ? OR c.symbol_name LIKE ? OR c.relative_path LIKE ?)').join(' OR ');
      const params: any[] = [];
      for (const w of words) {
        params.push(`%${w}%`, `%${w}%`, `%${w}%`);
      }

      const likeSql = `
        SELECT c.chunk_id, c.project_id, c.workspace_id, c.relative_path,
               c.symbol_name, c.symbol_type, c.start_line, c.end_line,
               c.content, c.language
        FROM code_chunks c
        WHERE c.project_id = ? AND c.workspace_id = ?
          AND (${orClauses})
        LIMIT ?
      `;
      const likeRows = await query<mysql.RowDataPacket[]>(likeSql, [
        projectId,
        workspaceId,
        ...params,
        limit,
      ]);

      return likeRows.map((r) => ({
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
        score: 0.65,
        channel: 'fulltext',
        explanation: 'MySQL keyword pattern match',
      }));
    }

    return [];
  }
}
