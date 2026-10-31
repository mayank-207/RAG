import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { ollamaClient } from '../embeddings/ollama.js';
import { qdrantManager } from '../vectors/qdrant.js';
import { SearchHit } from './types.js';
import { logger } from '../utils/logger.js';

export class VectorSearch {
  /**
   * Executes semantic vector search via Ollama and Qdrant.
   */
  public static async search(
    projectId: string,
    workspaceId: string,
    searchQuery: string,
    symbolType?: string,
    limit: number = 10
  ): Promise<SearchHit[]> {
    try {
      const vector = await ollamaClient.getEmbedding(searchQuery);
      if (!vector) {
        return [];
      }

      const qdrantHits = await qdrantManager.searchVectors(
        vector,
        {
          projectId,
          workspaceId,
          symbolType,
        },
        limit
      );

      if (qdrantHits.length === 0) return [];

      const chunkIds = qdrantHits.map((h) => h.payload?.chunk_id).filter(Boolean);
      if (chunkIds.length === 0) return [];

      const placeholders = chunkIds.map(() => '?').join(',');
      const rows = await query<mysql.RowDataPacket[]>(
        `SELECT c.chunk_id, c.project_id, c.workspace_id, c.relative_path,
                c.symbol_name, c.symbol_type, c.start_line, c.end_line,
                c.content, c.language
         FROM code_chunks c
         WHERE c.project_id = ? AND c.workspace_id = ?
           AND c.chunk_id IN (${placeholders})`,
        [projectId, workspaceId, ...chunkIds]
      );

      const rowMap = new Map<string, mysql.RowDataPacket>();
      for (const row of rows) {
        rowMap.set(row.chunk_id as string, row);
      }

      const hits: SearchHit[] = [];
      for (const qHit of qdrantHits) {
        const chunkId = qHit.payload?.chunk_id;
        const row = rowMap.get(chunkId);
        if (row) {
          hits.push({
            chunkId,
            projectId: row.project_id as string,
            workspaceId: row.workspace_id as string,
            relativePath: row.relative_path as string,
            symbolName: row.symbol_name as string | null,
            symbolType: row.symbol_type as string,
            startLine: Number(row.start_line),
            endLine: Number(row.end_line),
            content: row.content as string,
            language: row.language as string,
            score: qHit.score,
            channel: 'vector',
            explanation: `Qdrant semantic similarity (cosine: ${qHit.score.toFixed(3)})`,
          });
        }
      }

      return hits;
    } catch (err) {
      logger.debug({ err }, 'Semantic vector search failed or vector DB offline');
      return [];
    }
  }
}

