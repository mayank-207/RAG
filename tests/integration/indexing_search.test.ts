import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../../src/projects/manager.js';
import { Indexer } from '../../src/indexer/indexer.js';
import { HybridSearch } from '../../src/search/hybrid.js';
import { ImpactGraph } from '../../src/impact/graph.js';
import { query, closeDbPool } from '../../src/db/connection.js';

describe('End-to-End Indexing & Hybrid Search', () => {
  const laravelPath = path.resolve('tests/fixtures/synthetic-laravel');
  const reactPath = path.resolve('tests/fixtures/synthetic-react');

  beforeAll(async () => {
    // Register both test projects
    await ProjectManager.registerProject({
      id: 'test-crm',
      name: 'Test CRM',
      rootPath: laravelPath,
      framework: 'laravel',
      primaryLanguage: 'php',
    });

    await ProjectManager.registerProject({
      id: 'test-frontend',
      name: 'Test Frontend',
      rootPath: reactPath,
      framework: 'react',
      primaryLanguage: 'typescript',
    });
  });

  afterAll(async () => {
    await ProjectManager.removeProject('test-crm').catch(() => {});
    await ProjectManager.removeProject('test-frontend').catch(() => {});
    await closeDbPool();
  });

  it('indexes synthetic Laravel codebase and extracts AST symbols, routes, and migrations', async () => {
    const res = await Indexer.run({
      projectId: 'test-crm',
      mode: 'full',
    });

    expect(res.filesIndexed).toBeGreaterThan(0);
    expect(res.chunksCreated).toBeGreaterThan(0);

    // Verify secret exclusion: .env MUST NOT be indexed
    const secretFile = await query<any[]>(
      "SELECT * FROM indexed_files WHERE project_id = 'test-crm' AND relative_path = '.env'"
    );
    expect(secretFile).toHaveLength(0);

    const secretChunks = await query<any[]>(
      "SELECT * FROM code_chunks WHERE project_id = 'test-crm' AND content LIKE '%SUPER_SECRET_KEY%'"
    );
    expect(secretChunks).toHaveLength(0);

    // Verify User model was indexed
    const symbols = await query<any[]>(
      "SELECT * FROM symbols WHERE project_id = 'test-crm' AND name = 'User'"
    );
    expect(symbols.length).toBeGreaterThanOrEqual(1);

    // Verify Laravel routes were indexed
    const routes = await query<any[]>(
      "SELECT * FROM routes WHERE project_id = 'test-crm' AND uri_pattern = '/projects'"
    );
    expect(routes.length).toBeGreaterThanOrEqual(1);
    expect(routes[0].controller).toBe('ProjectController');
  });

  it('indexes synthetic React frontend codebase', async () => {
    const res = await Indexer.run({
      projectId: 'test-frontend',
      mode: 'full',
    });

    expect(res.filesIndexed).toBeGreaterThan(0);

    // Verify ProjectList component and useProjects hook were indexed
    const symbols = await query<any[]>(
      "SELECT * FROM symbols WHERE project_id = 'test-frontend' AND name IN ('ProjectList', 'useProjects')"
    );
    expect(symbols.length).toBeGreaterThanOrEqual(2);
  });

  it('strictly enforces project isolation during hybrid search', async () => {
    // Search for "Project" in Laravel CRM
    const crmSearch = await HybridSearch.search({
      projectId: 'test-crm',
      query: 'Project',
    });

    expect(crmSearch.chunks.length).toBeGreaterThan(0);
    // All returned chunks must belong to test-crm
    crmSearch.chunks.forEach((chunk) => {
      expect(chunk.projectId).toBe('test-crm');
      expect(chunk.relativePath).not.toContain('ProjectItem.tsx'); // From frontend!
    });

    // Search for "Project" in Frontend
    const frontendSearch = await HybridSearch.search({
      projectId: 'test-frontend',
      query: 'Project',
    });

    expect(frontendSearch.chunks.length).toBeGreaterThan(0);
    frontendSearch.chunks.forEach((chunk) => {
      expect(chunk.projectId).toBe('test-frontend');
      expect(chunk.relativePath).not.toContain('ProjectController.php'); // From CRM!
    });
  });

  it('analyzes downstream dependency impact', async () => {
    const impact = await ImpactGraph.analyzeImpact('test-crm', 'test-crm:working-copy', 'ProjectController');
    expect(impact.target).toBe('ProjectController');
    expect(impact.relatedRoutes.length).toBeGreaterThan(0);
    expect(impact.relatedRoutes[0].uri).toBe('/projects');
  });

  it('retrieves curated .ai business rules', async () => {
    const search = await HybridSearch.search({
      projectId: 'test-crm',
      query: 'budget validation',
    });

    expect(search.curatedRules.length).toBeGreaterThan(0);
    expect(search.curatedRules[0].ruleStatement).toContain('budget');
  });
});
