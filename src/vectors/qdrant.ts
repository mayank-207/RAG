import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload?: any;
}

export class QdrantManager {
  private client: QdrantClient;
  private collectionName: string;

  constructor() {
    this.client = new QdrantClient({
      url: config.qdrant.url,
      apiKey: config.qdrant.apiKey || undefined,
      checkCompatibility: false,
    });
    this.collectionName = config.qdrant.collectionPrefix;
  }

  /**
   * Health check for Qdrant server.
   */
  public async checkHealth(): Promise<{ ok: boolean; collections: string[]; error?: string }> {
    try {
      const collections = await this.client.getCollections();
      return {
        ok: true,
        collections: collections.collections.map((c) => c.name),
      };
    } catch (err: any) {
      return {
        ok: false,
        collections: [],
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Ensures the vector collection exists with appropriate vector dimensions and cosine metric.
   */
  public async ensureCollection(dimensions: number = 768): Promise<void> {
    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some((c) => c.name === this.collectionName);

      if (!exists) {
        logger.info({ collection: this.collectionName, dimensions }, 'Creating Qdrant vector collection...');
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: dimensions,
            distance: 'Cosine',
          },
        });

        // Create payload indexes for project_id and workspace_id to optimize filtering
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'project_id',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: 'workspace_id',
          field_schema: 'keyword',
        });
      }
    } catch (err) {
      logger.warn({ err, collection: this.collectionName }, 'Qdrant collection check/creation skipped or failed');
    }
  }

  /**
   * Upserts batch of vector points into Qdrant.
   */
  public async upsertVectors(
    points: Array<{
      id: string;
      vector: number[];
      payload: {
        chunk_id: string;
        project_id: string;
        workspace_id: string;
        relative_path: string;
        symbol_name: string | null;
        symbol_type: string;
        language: string;
        start_line: number;
        end_line: number;
        content_preview: string;
      };
    }>
  ): Promise<boolean> {
    if (points.length === 0) return true;

    try {
      await this.ensureCollection(points[0].vector.length);
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });
      return true;
    } catch (err) {
      logger.warn({ err }, 'Failed to upsert points into Qdrant');
      return false;
    }
  }

  /**
   * Searches for nearest vectors enforcing strict project and workspace isolation.
   */
  public async searchVectors(
    queryVector: number[],
    filter: {
      projectId: string;
      workspaceId?: string;
      symbolType?: string;
    },
    limit: number = 10
  ): Promise<VectorSearchResult[]> {
    try {
      const mustClauses: any[] = [
        {
          key: 'project_id',
          match: { value: filter.projectId },
        },
      ];

      if (filter.workspaceId) {
        mustClauses.push({
          key: 'workspace_id',
          match: { value: filter.workspaceId },
        });
      }

      if (filter.symbolType) {
        mustClauses.push({
          key: 'symbol_type',
          match: { value: filter.symbolType },
        });
      }

      const results = await this.client.query(this.collectionName, {
        query: queryVector,
        limit,
        filter: {
          must: mustClauses,
        },
        with_payload: true,
      });

      const points = (results as any).points || [];
      return points.map((r: any) => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
      }));
    } catch (err) {
      logger.warn({ err, filter }, 'Qdrant vector search failed, returning empty vector results');
      return [];
    }
  }

  /**
   * Deletes specific vectors by IDs.
   */
  public async deleteVectors(pointIds: string[]): Promise<void> {
    if (pointIds.length === 0) return;
    try {
      await this.client.delete(this.collectionName, {
        points: pointIds,
        wait: true,
      });
    } catch (err) {
      logger.warn({ err, count: pointIds.length }, 'Failed to delete points from Qdrant');
    }
  }

  /**
   * Deletes all vectors for a project.
   */
  public async deleteProjectVectors(projectId: string): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        filter: {
          must: [
            {
              key: 'project_id',
              match: { value: projectId },
            },
          ],
        },
        wait: true,
      });
    } catch (err) {
      logger.warn({ err, projectId }, 'Failed to delete project vectors from Qdrant');
    }
  }
}

export const qdrantManager = new QdrantManager();
