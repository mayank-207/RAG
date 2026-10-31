import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { CuratedMemoryHit } from './types.js';

export class MemorySearch {
  /**
   * Searches curated project memory (.ai/ markdown guidelines, rules, decisions).
   */
  public static async search(
    projectId: string,
    workspaceId: string,
    searchQuery: string,
    limit: number = 5
  ): Promise<CuratedMemoryHit[]> {
    const cleanQuery = searchQuery.trim();
    if (!cleanQuery) return [];

    const terms = cleanQuery.replace(/[^\w\s]/g, ' ').trim();

    // 1. Try FULLTEXT search on curated_memory
    if (terms) {
      try {
        const sql = `
          SELECT category, topic, rule_statement, status, source_file,
                 MATCH(topic, rule_statement) AGAINST(? IN NATURAL LANGUAGE MODE) AS score
          FROM curated_memory
          WHERE project_id = ? AND workspace_id = ?
            AND MATCH(topic, rule_statement) AGAINST(? IN NATURAL LANGUAGE MODE)
          ORDER BY score DESC
          LIMIT ?
        `;
        const rows = await query<mysql.RowDataPacket[]>(sql, [terms, projectId, workspaceId, terms, limit]);
        if (rows.length > 0) {
          return rows.map((r) => ({
            category: r.category as string,
            topic: r.topic as string,
            ruleStatement: r.rule_statement as string,
            status: r.status as string,
            sourceFile: r.source_file as string | null,
            score: Number(r.score) || 1.0,
          }));
        }
      } catch {
        // Fall through to LIKE fallback
      }
    }

    // Keyword fallback: match significant words (length >= 4)
    const words = cleanQuery
      .split(/\s+/)
      .map((w) => w.replace(/[^\w]/g, '').trim())
      .filter((w) => w.length >= 4);

    if (words.length > 0) {
      const orClauses = words.map(() => '(topic LIKE ? OR rule_statement LIKE ?)').join(' OR ');
      const params: any[] = [];
      for (const w of words) {
        params.push(`%${w}%`, `%${w}%`);
      }

      const likeSql = `
        SELECT category, topic, rule_statement, status, source_file
        FROM curated_memory
        WHERE project_id = ? AND workspace_id = ?
          AND (${orClauses})
        LIMIT ?
      `;
      const likeRows = await query<mysql.RowDataPacket[]>(likeSql, [
        projectId,
        workspaceId,
        ...params,
        limit,
      ]);

      if (likeRows.length > 0) {
        return likeRows.map((r) => ({
          category: r.category as string,
          topic: r.topic as string,
          ruleStatement: r.rule_statement as string,
          status: r.status as string,
          sourceFile: r.source_file as string | null,
          score: 0.85,
        }));
      }
    }

    return [];
  }
}
