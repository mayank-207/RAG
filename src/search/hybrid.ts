import { config } from '../config/index.js';
import { ProjectManager } from '../projects/manager.js';
import { ExactSearch } from './exact.js';
import { FulltextSearch } from './fulltext.js';
import { VectorSearch } from './vector.js';
import { MemorySearch } from './memory.js';
import { SearchHit, CuratedMemoryHit, HybridSearchQuery } from './types.js';
import { ImpactGraph } from '../impact/graph.js';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export interface HybridSearchResult {
  query: string;
  projectId: string;
  workspaceId: string;
  chunks: SearchHit[];
  curatedRules: CuratedMemoryHit[];
  relatedDependencies: Array<{ source: string; target: string; type: string }>;
  executionMs: number;
}

export class HybridSearch {
  /**
   * Performs multi-channel hybrid search and fuses results via weighted Reciprocal Rank Fusion.
   */
  public static async search(options: HybridSearchQuery): Promise<HybridSearchResult> {
    const startTime = Date.now();
    const project = await ProjectManager.getProject(options.projectId);
    if (!project) {
      throw new Error(`Project not found: ${options.projectId}`);
    }

    const workspace = await ProjectManager.getOrCreateWorkspace(project.id, options.workspaceId);
    const limit = options.limit || config.search.maxResults;

    // Run search channels in parallel
    const [exactHits, pathHits, ftHits, vectorHits, memoryHits] = await Promise.all([
      ExactSearch.search(project.id, workspace.id, options.query, limit),
      options.pathFilter ? ExactSearch.searchPath(project.id, workspace.id, options.pathFilter, limit) : Promise.resolve([]),
      FulltextSearch.search(project.id, workspace.id, options.query, limit),
      VectorSearch.search(project.id, workspace.id, options.query, options.symbolType, limit),
      MemorySearch.search(project.id, workspace.id, options.query, 5),
    ]);

    // Reciprocal Rank Fusion (RRF)
    const fusedScores = new Map<string, { hit: SearchHit; rrfScore: number }>();
    const k = 60; // Standard RRF smoothing constant

    // Channel 1: Exact hits
    exactHits.forEach((hit, rank) => {
      const weight = config.search.exactWeight;
      const score = weight * (1 / (k + rank + 1));
      fusedScores.set(hit.chunkId, { hit, rrfScore: score });
    });

    // Channel 2: Path hits
    pathHits.forEach((hit, rank) => {
      const weight = 0.3;
      const score = weight * (1 / (k + rank + 1));
      const existing = fusedScores.get(hit.chunkId);
      if (existing) {
        existing.rrfScore += score;
      } else {
        fusedScores.set(hit.chunkId, { hit, rrfScore: score });
      }
    });

    // Channel 3: FULLTEXT hits
    ftHits.forEach((hit, rank) => {
      const weight = config.search.fulltextWeight;
      const score = weight * (1 / (k + rank + 1));
      const existing = fusedScores.get(hit.chunkId);
      if (existing) {
        existing.rrfScore += score;
      } else {
        fusedScores.set(hit.chunkId, { hit, rrfScore: score });
      }
    });

    // Channel 4: Vector hits
    vectorHits.forEach((hit, rank) => {
      const weight = config.search.vectorWeight;
      const score = weight * (1 / (k + rank + 1));
      const existing = fusedScores.get(hit.chunkId);
      if (existing) {
        existing.rrfScore += score;
      } else {
        fusedScores.set(hit.chunkId, { hit, rrfScore: score });
      }
    });

    // Sort by final fused score
    const sortedHits = Array.from(fusedScores.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map((item) => ({
        ...item.hit,
        score: Math.round(item.rrfScore * 10000) / 100, // Normalized score percentage
      }));

    // Dependency enrichment: find dependencies for the top matching files
    const topFiles = Array.from(new Set(sortedHits.map((h) => h.relativePath))).slice(0, 5);
    const relatedDependencies: Array<{ source: string; target: string; type: string }> = [];

    if (topFiles.length > 0) {
      const placeholders = topFiles.map(() => '?').join(',');
      const depRows = await query<any[]>(
        `SELECT DISTINCT e.source_node, e.target_node, e.relationship
         FROM dependency_graph_edges e
         WHERE e.project_id = ? AND e.workspace_id = ?
           AND (e.source_node IN (${placeholders}) OR e.target_node IN (${placeholders}))
         LIMIT 15`,
        [project.id, workspace.id, ...topFiles, ...topFiles]
      );

      for (const row of depRows) {
        relatedDependencies.push({
          source: row.source_node,
          target: row.target_node,
          type: row.relationship,
        });
      }
    }

    const executionMs = Date.now() - startTime;

    // Record retrieval log asynchronously
    query(
      `INSERT INTO retrieval_logs (project_id, workspace_id, query_text, channel_results, execution_ms)
       VALUES (?, ?, ?, ?, ?)`,
      [
        project.id,
        workspace.id,
        options.query,
        JSON.stringify({
          exactCount: exactHits.length,
          fulltextCount: ftHits.length,
          vectorCount: vectorHits.length,
          memoryCount: memoryHits.length,
        }),
        executionMs,
      ]
    ).catch((err) => logger.debug({ err }, 'Failed to record retrieval log'));

    return {
      query: options.query,
      projectId: project.id,
      workspaceId: workspace.id,
      chunks: sortedHits,
      curatedRules: memoryHits,
      relatedDependencies,
      executionMs,
    };
  }
}
