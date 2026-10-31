import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { ProjectManager } from '../../src/projects/manager.js';
import { Indexer } from '../../src/indexer/indexer.js';
import { ContextBuilder } from '../../src/mcp/context.js';
import { HybridSearch } from '../../src/search/hybrid.js';
import { ImpactGraph } from '../../src/impact/graph.js';
import { IndexLock } from '../../src/utils/lock.js';
import { closeDbPool } from '../../src/db/connection.js';

describe('MCP Tools & Antigravity Context Verification', () => {
  const laravelPath = path.resolve('tests/fixtures/synthetic-laravel');

  beforeAll(async () => {
    IndexLock.release('mcp-test-crm', 'mcp-test-crm:working-copy');
    await ProjectManager.registerProject({
      id: 'mcp-test-crm',
      name: 'MCP Test CRM',
      rootPath: laravelPath,
      framework: 'laravel',
      primaryLanguage: 'php',
    });

    await Indexer.run({
      projectId: 'mcp-test-crm',
      mode: 'full',
    });
  });

  afterAll(async () => {
    IndexLock.release('mcp-test-crm', 'mcp-test-crm:working-copy');
    await ProjectManager.removeProject('mcp-test-crm').catch(() => {});
    await closeDbPool();
  });

  it('builds comprehensive task context with business rules, source files, and tests', async () => {
    const context = await ContextBuilder.build({
      project: 'mcp-test-crm',
      taskDescription: 'Implement department-based validation when converting inquiry to project',
    });

    expect(context.project.id).toBe('mcp-test-crm');
    expect(context.project.framework).toBe('laravel');
    expect(context.businessRules.length).toBeGreaterThanOrEqual(1);

    // Business rules should contain department permission or budget rules
    const hasRule = context.businessRules.some((r) => r.statement.includes('department') || r.statement.includes('budget'));
    expect(hasRule).toBe(true);

    expect(context.suggestedImplementationAreas.length).toBeGreaterThan(0);
    expect(context.relevantSourceFiles.length).toBeGreaterThan(0);
  });

  it('performs search_code returning code snippets and line numbers', async () => {
    const res = await HybridSearch.search({
      projectId: 'mcp-test-crm',
      query: 'convertFromInquiry',
    });

    expect(res.chunks.length).toBeGreaterThan(0);
    const hit = res.chunks[0];
    expect(hit.symbolName).toContain('convertFromInquiry');
    expect(hit.startLine).toBeGreaterThan(0);
    expect(hit.endLine).toBeGreaterThanOrEqual(hit.startLine);
    expect(hit.content).toContain('function convertFromInquiry');
  });

  it('performs get_impact returning affected routes and controllers', async () => {
    const impact = await ImpactGraph.analyzeImpact('mcp-test-crm', 'mcp-test-crm:working-copy', 'Project');
    expect(impact.target).toBe('Project');
    expect(impact.relatedRoutes.length).toBeGreaterThan(0);
  });
});
