import mysql from 'mysql2/promise';
import { query } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export interface DependencyEdge {
  id: number;
  sourceNode: string;
  sourceType: string;
  targetNode: string;
  targetType: string;
  relationship: string;
  isConfirmed: boolean;
}

export interface ImpactAnalysisResult {
  target: string;
  directDependents: Array<{ node: string; type: string; relationship: string; isConfirmed: boolean }>;
  indirectDependents: Array<{ node: string; type: string; relationship: string; depth: number }>;
  relatedRoutes: Array<{ uri: string; method: string; controller?: string; action?: string }>;
  relatedTables: Array<{ tableName: string; modelClass?: string }>;
  affectedTests: string[];
}

export class ImpactGraph {
  /**
   * Records edges into dependency_graph_edges table.
   */
  public static async recordEdges(
    projectId: string,
    workspaceId: string,
    edges: Array<{
      sourceNode: string;
      sourceType: string;
      targetNode: string;
      targetType: string;
      relationship: string;
      isConfirmed?: boolean;
    }>
  ): Promise<void> {
    if (edges.length === 0) return;

    for (const edge of edges) {
      await query(
        `INSERT INTO dependency_graph_edges
          (project_id, workspace_id, source_node, source_type, target_node, target_type, relationship, is_confirmed)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          projectId,
          workspaceId,
          edge.sourceNode,
          edge.sourceType,
          edge.targetNode,
          edge.targetType,
          edge.relationship,
          edge.isConfirmed !== undefined ? (edge.isConfirmed ? 1 : 0) : 1,
        ]
      );
    }
  }

  /**
   * Analyzes downstream impact if a file, symbol, or model is changed.
   */
  public static async analyzeImpact(
    projectId: string,
    workspaceId: string,
    targetIdentifier: string
  ): Promise<ImpactAnalysisResult> {
    // 1. Direct dependents (who depends on target)
    // Matches if targetNode matches targetIdentifier or targetIdentifier ends with targetNode
    const directRows = await query<mysql.RowDataPacket[]>(
      `SELECT DISTINCT source_node, source_type, relationship, is_confirmed
       FROM dependency_graph_edges
       WHERE project_id = ? AND workspace_id = ?
         AND (target_node = ? OR target_node LIKE ?)`,
      [projectId, workspaceId, targetIdentifier, `%${targetIdentifier}%`]
    );

    const directDependents = directRows.map((r) => ({
      node: r.source_node as string,
      type: r.source_type as string,
      relationship: r.relationship as string,
      isConfirmed: Boolean(r.is_confirmed),
    }));

    // 2. Transitive / Indirect Dependents (depth = 2)
    const directNodes = directDependents.map((d) => d.node);
    const indirectDependents: Array<{ node: string; type: string; relationship: string; depth: number }> = [];

    if (directNodes.length > 0) {
      // Find what depends on the direct dependents
      const placeholders = directNodes.map(() => '?').join(',');
      const indirectRows = await query<mysql.RowDataPacket[]>(
        `SELECT DISTINCT source_node, source_type, relationship, target_node
         FROM dependency_graph_edges
         WHERE project_id = ? AND workspace_id = ?
           AND target_node IN (${placeholders})`,
        [projectId, workspaceId, ...directNodes]
      );

      for (const row of indirectRows) {
        if (!directNodes.includes(row.source_node) && row.source_node !== targetIdentifier) {
          indirectDependents.push({
            node: row.source_node as string,
            type: row.source_type as string,
            relationship: `via ${row.target_node} (${row.relationship})`,
            depth: 2,
          });
        }
      }
    }

    // 3. Related Routes
    const routeRows = await query<mysql.RowDataPacket[]>(
      `SELECT uri_pattern, http_method, controller, action
       FROM routes
       WHERE project_id = ? AND workspace_id = ?
         AND (controller LIKE ? OR uri_pattern LIKE ?)`,
      [projectId, workspaceId, `%${targetIdentifier}%`, `%${targetIdentifier}%`]
    );

    const relatedRoutes = routeRows.map((r) => ({
      uri: r.uri_pattern as string,
      method: r.http_method as string,
      controller: r.controller as string | undefined,
      action: r.action as string | undefined,
    }));

    // 4. Related Database Tables
    const tableRows = await query<mysql.RowDataPacket[]>(
      `SELECT table_name, model_class
       FROM schema_tables
       WHERE project_id = ? AND workspace_id = ?
         AND (table_name LIKE ? OR model_class LIKE ?)`,
      [projectId, workspaceId, `%${targetIdentifier}%`, `%${targetIdentifier}%`]
    );

    const relatedTables = tableRows.map((r) => ({
      tableName: r.table_name as string,
      modelClass: r.model_class as string | undefined,
    }));

    // 5. Affected Tests
    const testRows = await query<mysql.RowDataPacket[]>(
      `SELECT relative_path
       FROM indexed_files
       WHERE project_id = ? AND workspace_id = ?
         AND (relative_path LIKE '%test%' OR relative_path LIKE '%spec%')
         AND relative_path LIKE ?`,
      [projectId, workspaceId, `%${targetIdentifier}%`]
    );

    const affectedTests = testRows.map((r) => r.relative_path as string);

    return {
      target: targetIdentifier,
      directDependents,
      indirectDependents,
      relatedRoutes,
      relatedTables,
      affectedTests,
    };
  }
}

