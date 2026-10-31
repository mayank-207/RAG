import { HybridSearch } from '../search/hybrid.js';
import { ImpactGraph } from '../impact/graph.js';
import { ProjectManager } from '../projects/manager.js';
import { query } from '../db/connection.js';

export interface TaskContextInput {
  project: string;
  taskDescription: string;
  workspace?: string;
  relevantFiles?: string[];
}

export interface TaskContextOutput {
  project: {
    id: string;
    name: string;
    framework: string | null;
    language: string;
  };
  workspace: {
    id: string;
    name: string;
    branch: string | null;
    commitHash: string | null;
  };
  businessRules: Array<{ topic: string; statement: string; category: string }>;
  relevantSourceFiles: Array<{
    relativePath: string;
    symbolName: string | null;
    symbolType: string;
    startLine: number;
    endLine: number;
    codeSnippet: string;
    relevanceScore: number;
  }>;
  relatedRoutes: Array<{ uri: string; method: string; controller?: string; action?: string }>;
  databaseRelationships: Array<{ tableName: string; modelClass?: string; columns?: any[] }>;
  dependencies: Array<{ source: string; target: string; type: string }>;
  relevantTests: string[];
  suggestedImplementationAreas: string[];
  warnings: string[];
}

export class ContextBuilder {
  public static async build(input: TaskContextInput): Promise<TaskContextOutput> {
    const project = await ProjectManager.getProject(input.project);
    if (!project) {
      throw new Error(`Project not found: ${input.project}`);
    }

    const workspace = await ProjectManager.getOrCreateWorkspace(project.id, input.workspace);

    // 1. Run hybrid search on developer task description
    const searchRes = await HybridSearch.search({
      projectId: project.id,
      workspaceId: workspace.id,
      query: input.taskDescription,
      limit: 10,
    });

    // 2. Business rules from curated memory
    const businessRules = searchRes.curatedRules.map((r) => ({
      topic: r.topic,
      statement: r.ruleStatement,
      category: r.category,
    }));

    // If query didn't match a specific rule, load top approved guidelines
    if (businessRules.length === 0) {
      const defaultRules = await query<any[]>(
        'SELECT category, topic, rule_statement FROM curated_memory WHERE project_id = ? AND workspace_id = ? LIMIT 5',
        [project.id, workspace.id]
      );
      for (const r of defaultRules) {
        businessRules.push({
          topic: r.topic,
          statement: r.rule_statement,
          category: r.category,
        });
      }
    }

    // 3. Relevant code chunks
    const relevantSourceFiles = searchRes.chunks.map((c) => ({
      relativePath: c.relativePath,
      symbolName: c.symbolName,
      symbolType: c.symbolType,
      startLine: c.startLine,
      endLine: c.endLine,
      codeSnippet: c.content,
      relevanceScore: c.score,
    }));

    // 4. Find affected models / symbols to inspect impact
    const candidateSymbols = searchRes.chunks.map((c) => c.symbolName).filter(Boolean) as string[];
    const topSymbol = candidateSymbols[0] || project.name;

    const impact = await ImpactGraph.analyzeImpact(project.id, workspace.id, topSymbol);

    // 5. Look up schema tables matching task keywords or models
    const tableRows = await query<any[]>(
      `SELECT t.table_name, t.model_class,
              JSON_ARRAYAGG(JSON_OBJECT('name', c.column_name, 'type', c.data_type, 'pk', c.is_primary_key, 'fk_table', c.foreign_table)) as cols
       FROM schema_tables t
       LEFT JOIN schema_columns c ON c.table_id = t.id
       WHERE t.project_id = ? AND t.workspace_id = ?
       GROUP BY t.id
       LIMIT 5`,
      [project.id, workspace.id]
    );

    const databaseRelationships = tableRows.map((r) => ({
      tableName: r.table_name,
      modelClass: r.model_class || undefined,
      columns: typeof r.cols === 'string' ? JSON.parse(r.cols) : r.cols,
    }));

    // 6. Routes
    const relatedRoutes = impact.relatedRoutes.length > 0 ? impact.relatedRoutes : [];

    // 7. Suggested implementation areas
    const suggestedImplementationAreas: string[] = [];
    const uniqueFiles = Array.from(new Set(relevantSourceFiles.map((f) => f.relativePath)));

    if (uniqueFiles.length > 0) {
      suggestedImplementationAreas.push(...uniqueFiles.map((f) => `Modify or inspect: ${f}`));
    }
    if (relatedRoutes.length > 0) {
      suggestedImplementationAreas.push(`Update routing endpoints: ${relatedRoutes.map((r) => `${r.method} ${r.uri}`).join(', ')}`);
    }

    // 8. Warnings & gotchas
    const warnings: string[] = [];
    warnings.push('Ensure you do not commit modifications to .env or secret credentials.');
    if (workspace.type === 'working_copy') {
      warnings.push(`Context is running against working directory state for branch '${workspace.git_branch || 'main'}'.`);
    }

    return {
      project: {
        id: project.id,
        name: project.name,
        framework: project.framework,
        language: project.primary_language,
      },
      workspace: {
        id: workspace.id,
        name: workspace.name,
        branch: workspace.git_branch,
        commitHash: workspace.git_commit_hash,
      },
      businessRules,
      relevantSourceFiles,
      relatedRoutes,
      databaseRelationships,
      dependencies: searchRes.relatedDependencies,
      relevantTests: impact.affectedTests,
      suggestedImplementationAreas,
      warnings,
    };
  }
}
