#!/usr/bin/env node
import { Command } from 'commander';
import { runMigrations, getMigrationStatus } from '../db/migrate.js';
import { testDbConnection, closeDbPool } from '../db/connection.js';
import { ProjectManager } from '../projects/manager.js';
import { Indexer } from '../indexer/indexer.js';
import { ProjectWatcher } from '../indexer/watcher.js';
import { HybridSearch } from '../search/hybrid.js';
import { ImpactGraph } from '../impact/graph.js';
import { ContextBuilder } from '../mcp/context.js';
import { CodeContextMcpServer } from '../mcp/server.js';
import { ollamaClient } from '../embeddings/ollama.js';
import { qdrantManager } from '../vectors/qdrant.js';
import { logger } from '../utils/logger.js';

const program = new Command();

program
  .name('code-context-mcp')
  .description('Standalone RAG + MCP Code Context Server for AI Coding Assistants')
  .version('1.0.0');

// Database commands
program
  .command('db:migrate')
  .description('Run pending MySQL 8.4 schema migrations')
  .action(async () => {
    try {
      console.log('Checking database connection...');
      const connTest = await testDbConnection();
      if (!connTest.ok) {
        console.error('MySQL connection failed:', connTest.error);
        process.exit(1);
      }
      console.log(`Connected to MySQL ${connTest.version}. Executing migrations...`);
      const { applied, errors } = await runMigrations();
      if (errors.length > 0) {
        console.error('Migration errors occurred:');
        errors.forEach((e) => console.error(' - ', e));
        process.exit(1);
      }
      if (applied.length > 0) {
        console.log(`Successfully applied ${applied.length} migration(s):`);
        applied.forEach((m) => console.log(` ✔ ${m}`));
      } else {
        console.log('Database is already up to date.');
      }
    } catch (err: any) {
      console.error('Fatal migration error:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('db:status')
  .description('Show migration status and MySQL database info')
  .action(async () => {
    try {
      const connTest = await testDbConnection();
      if (!connTest.ok) {
        console.error('MySQL connection failed:', connTest.error);
        process.exit(1);
      }
      const { executed, pending } = await getMigrationStatus();
      console.log(`\nMySQL Database Status (Server: ${connTest.version})`);
      console.log('--------------------------------------------------');
      console.log(`Executed Migrations: ${executed.length}`);
      executed.forEach((m) => console.log(`  [Batch ${m.batch}] ${m.name} (${m.executed_at})`));
      console.log(`Pending Migrations:  ${pending.length}`);
      pending.forEach((p) => console.log(`  [PENDING] ${p}`));
      console.log('--------------------------------------------------\n');
    } catch (err: any) {
      console.error('Error fetching db status:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

// Project commands
program
  .command('project:add')
  .description('Register a new local codebase')
  .requiredOption('--path <path>', 'Absolute or relative path to project directory')
  .option('--id <id>', 'Unique project identifier')
  .option('--name <name>', 'Descriptive name for project')
  .option('--description <description>', 'Project summary or purpose')
  .option('--framework <framework>', 'Framework type (laravel, react, node, etc.)')
  .option('--language <language>', 'Primary language (php, typescript, javascript)')
  .option('--branch <branch>', 'Default branch name')
  .action(async (opts) => {
    try {
      const name = opts.name || opts.path.split(/[/\\]/).filter(Boolean).pop() || 'project';
      const res = await ProjectManager.registerProject({
        id: opts.id,
        name,
        rootPath: opts.path,
        description: opts.description,
        framework: opts.framework,
        primaryLanguage: opts.language,
        defaultBranch: opts.branch,
      });
      console.log('\n✔ Project registered successfully:');
      console.log(`  ID:        ${res.project.id}`);
      console.log(`  Name:      ${res.project.name}`);
      console.log(`  Path:      ${res.project.root_path}`);
      console.log(`  Framework: ${res.project.framework || 'auto'}`);
      console.log(`  Language:  ${res.project.primary_language}`);
      console.log(`  Workspace: ${res.workspace.name} (type: ${res.workspace.type})\n`);
    } catch (err: any) {
      console.error('Failed to register project:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('project:list')
  .description('List all registered codebases')
  .action(async () => {
    try {
      const projects = await ProjectManager.listProjects();
      console.log(`\nRegistered Codebases (${projects.length}):`);
      console.log('-------------------------------------------------------------------------------------------------');
      if (projects.length === 0) {
        console.log('No registered projects found. Use "npm run project:add -- --path <dir>" to register one.');
      } else {
        projects.forEach((p) => {
          console.log(`• [${p.id}] ${p.name}`);
          console.log(`   Path:        ${p.root_path}`);
          console.log(`   Framework:   ${p.framework || 'unknown'} | Language: ${p.primary_language} | Branch: ${p.default_branch}`);
          console.log(`   Indexed:     ${p.file_count} files, ${p.chunk_count} chunks (last indexed: ${p.last_indexed || 'never'})`);
        });
      }
      console.log('-------------------------------------------------------------------------------------------------\n');
    } catch (err: any) {
      console.error('Error listing projects:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('project:remove')
  .description('Remove a project registration or clear its index data')
  .requiredOption('--project <id>', 'Project ID to remove')
  .option('--index-only', 'Purge generated index data only, keeping registration', false)
  .action(async (opts) => {
    try {
      await ProjectManager.removeProject(opts.project, opts.indexOnly);
      if (opts.indexOnly) {
        console.log(`✔ Cleared index data for project '${opts.project}'. Registration preserved.`);
      } else {
        console.log(`✔ Completely removed project '${opts.project}' and its index data.`);
      }
    } catch (err: any) {
      console.error('Error removing project:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

// Indexing commands
program
  .command('index:full')
  .description('Run a full index on a registered project')
  .requiredOption('--project <id>', 'Project ID or name to index')
  .option('--workspace <name>', 'Target workspace or branch')
  .action(async (opts) => {
    try {
      console.log(`Starting full indexing for '${opts.project}'...`);
      const res = await Indexer.run({
        projectId: opts.project,
        workspaceId: opts.workspace,
        mode: 'full',
      });
      console.log('\n✔ Full Indexing Complete:');
      console.log(`  Files scanned:     ${res.filesScanned}`);
      console.log(`  Files indexed:     ${res.filesIndexed}`);
      console.log(`  Chunks created:    ${res.chunksCreated}`);
      console.log(`  Vectors generated: ${res.vectorsGenerated}`);
      console.log(`  Duration:          ${(res.durationMs / 1000).toFixed(2)}s\n`);
    } catch (err: any) {
      console.error('Indexing failed:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('index:incremental')
  .description('Run incremental indexing (updates only modified and added files)')
  .requiredOption('--project <id>', 'Project ID or name to index')
  .option('--workspace <name>', 'Target workspace or branch')
  .action(async (opts) => {
    try {
      console.log(`Starting incremental indexing for '${opts.project}'...`);
      const res = await Indexer.run({
        projectId: opts.project,
        workspaceId: opts.workspace,
        mode: 'incremental',
      });
      console.log('\n✔ Incremental Indexing Complete:');
      console.log(`  Files scanned:     ${res.filesScanned}`);
      console.log(`  Files updated:     ${res.filesIndexed}`);
      console.log(`  Files removed:     ${res.filesDeleted}`);
      console.log(`  Chunks generated:  ${res.chunksCreated}`);
      console.log(`  Vectors generated: ${res.vectorsGenerated}`);
      console.log(`  Duration:          ${(res.durationMs / 1000).toFixed(2)}s\n`);
    } catch (err: any) {
      console.error('Incremental indexing failed:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('index:watch')
  .description('Watch project directory for file changes and update index automatically')
  .requiredOption('--project <id>', 'Project ID to watch')
  .option('--workspace <name>', 'Target workspace')
  .action(async (opts) => {
    try {
      await ProjectWatcher.watch(opts.project, opts.workspace);
      console.log(`Watching for changes in project '${opts.project}'. Press Ctrl+C to stop.`);
      await new Promise(() => {}); // Keep alive
    } catch (err: any) {
      console.error('Watcher failed:', err?.message || err);
      process.exit(1);
    }
  });

// Search and context commands
program
  .command('search')
  .description('Search code across indexed project')
  .requiredOption('--project <id>', 'Project ID')
  .requiredOption('--query <query>', 'Search query')
  .option('--workspace <name>', 'Workspace name')
  .option('--symbol-type <type>', 'Filter by symbol type (class, method, function, component, hook)')
  .option('--limit <limit>', 'Maximum results', '10')
  .action(async (opts) => {
    try {
      const res = await HybridSearch.search({
        projectId: opts.project,
        workspaceId: opts.workspace,
        query: opts.query,
        symbolType: opts.symbolType,
        limit: Number(opts.limit),
      });

      console.log(`\nSearch Results for: "${res.query}" (${res.chunks.length} hits, ${res.executionMs}ms)`);
      console.log('================================================================================');

      if (res.curatedRules.length > 0) {
        console.log('\n[Curated Business Rules / Standards]');
        res.curatedRules.forEach((r) => {
          console.log(` • [${r.category.toUpperCase()}] ${r.topic}: ${r.ruleStatement.slice(0, 150)}...`);
        });
      }

      console.log('\n[Matching Code Chunks]');
      res.chunks.forEach((c, idx) => {
        console.log(`\n#${idx + 1} Score: ${c.score}% | ${c.channel.toUpperCase()} | ${c.symbolName || '(unnamed)'} [${c.symbolType}]`);
        console.log(`File: ${c.relativePath} (lines ${c.startLine}-${c.endLine})`);
        console.log('--------------------------------------------------------------------------------');
        console.log(c.content.slice(0, 300) + (c.content.length > 300 ? '\n... [truncated]' : ''));
      });
      console.log('\n================================================================================\n');
    } catch (err: any) {
      console.error('Search error:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('context')
  .description('Retrieve complete task context for AI coding assistant')
  .requiredOption('--project <id>', 'Project ID')
  .requiredOption('--task <description>', 'Developer task description')
  .option('--workspace <name>', 'Workspace')
  .action(async (opts) => {
    try {
      const ctx = await ContextBuilder.build({
        project: opts.project,
        taskDescription: opts.task,
        workspace: opts.workspace,
      });

      console.log('\n================================ TASK CONTEXT ================================');
      console.log(`Project:   ${ctx.project.name} (${ctx.project.framework || 'generic'} / ${ctx.project.language})`);
      console.log(`Workspace: ${ctx.workspace.name} (branch: ${ctx.workspace.branch || 'main'})`);

      if (ctx.businessRules.length > 0) {
        console.log('\n--- Business Rules & Architecture Constraints ---');
        ctx.businessRules.forEach((r) => console.log(`• [${r.category}] ${r.topic}: ${r.statement.slice(0, 150)}...`));
      }

      console.log(`\n--- Suggested Files to Modify (${ctx.suggestedImplementationAreas.length}) ---`);
      ctx.suggestedImplementationAreas.forEach((area) => console.log(`• ${area}`));

      console.log(`\n--- Relevant Code Chunks (${ctx.relevantSourceFiles.length}) ---`);
      ctx.relevantSourceFiles.slice(0, 5).forEach((f) => {
        console.log(`• ${f.relativePath}:${f.startLine}-${f.endLine} (${f.symbolName || f.symbolType})`);
      });

      if (ctx.relevantTests.length > 0) {
        console.log(`\n--- Relevant Test Files ---`);
        ctx.relevantTests.forEach((t) => console.log(`• ${t}`));
      }

      console.log('==============================================================================\n');
    } catch (err: any) {
      console.error('Failed to get context:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('impact')
  .description('Perform dependency and impact analysis on a file, class, or symbol')
  .requiredOption('--project <id>', 'Project ID')
  .requiredOption('--target <symbolOrFile>', 'Class, method, or file path to analyze')
  .option('--workspace <name>', 'Workspace')
  .action(async (opts) => {
    try {
      const proj = await ProjectManager.getProject(opts.project);
      if (!proj) throw new Error(`Project not found: ${opts.project}`);
      const ws = await ProjectManager.getOrCreateWorkspace(proj.id, opts.workspace);

      const impact = await ImpactGraph.analyzeImpact(proj.id, ws.id, opts.target);

      console.log(`\nImpact Analysis for: "${impact.target}"`);
      console.log('================================================================================');
      console.log(`Direct Dependents (${impact.directDependents.length}):`);
      impact.directDependents.forEach((d) => console.log(` • ${d.node} (${d.relationship}) [${d.isConfirmed ? 'Confirmed AST' : 'Inferred'}]`));

      console.log(`\nIndirect Downstream Dependents (${impact.indirectDependents.length}):`);
      impact.indirectDependents.forEach((d) => console.log(` • ${d.node} (${d.relationship})`));

      console.log(`\nRelated Application Routes (${impact.relatedRoutes.length}):`);
      impact.relatedRoutes.forEach((r) => console.log(` • ${r.method} ${r.uri} -> ${r.controller || ''}@${r.action || ''}`));

      console.log(`\nRelated Database Tables (${impact.relatedTables.length}):`);
      impact.relatedTables.forEach((t) => console.log(` • ${t.tableName} (Model: ${t.modelClass || 'unassigned'})`));

      console.log(`\nAffected Test Suites (${impact.affectedTests.length}):`);
      impact.affectedTests.forEach((t) => console.log(` • ${t}`));
      console.log('================================================================================\n');
    } catch (err: any) {
      console.error('Impact analysis failed:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

program
  .command('health')
  .description('Check connectivity to MySQL 8.4, Qdrant, and Ollama')
  .action(async () => {
    console.log('\nChecking system health & services...');
    console.log('--------------------------------------------------');

    // MySQL
    const dbTest = await testDbConnection();
    if (dbTest.ok) {
      console.log(`✔ MySQL 8.4: Connected (Server: ${dbTest.version})`);
    } else {
      console.log(`✖ MySQL 8.4: Disconnected (${dbTest.error})`);
    }

    // Qdrant
    const qdrantTest = await qdrantManager.checkHealth();
    if (qdrantTest.ok) {
      console.log(`✔ Qdrant Vector DB: Connected (${qdrantTest.collections.length} collection(s))`);
    } else {
      console.log(`⚠ Qdrant Vector DB: Offline (${qdrantTest.error})`);
      console.log('   (Start local Qdrant via: docker run -p 6333:6333 qdrant/qdrant or qdrant.exe)');
    }

    // Ollama
    const ollamaTest = await ollamaClient.checkHealth();
    if (ollamaTest.ok) {
      console.log(`✔ Ollama Embeddings: Connected (Model '${ollamaClient.getModelName()}': ${ollamaTest.modelAvailable ? 'Available' : 'Missing - run "ollama pull ' + ollamaClient.getModelName() + '"'})`);
    } else {
      console.log(`⚠ Ollama Embeddings: Offline (${ollamaTest.error})`);
      console.log('   (Start local Ollama via: ollama serve)');
    }

    console.log('--------------------------------------------------\n');
    await closeDbPool();
  });

program
  .command('status')
  .description('Display overview of registered projects and indexing statistics')
  .action(async () => {
    try {
      const projects = await ProjectManager.listProjects();
      console.log('\nSystem Status Overview:');
      console.log(`• Total Registered Projects: ${projects.length}`);
      const totalFiles = projects.reduce((sum, p) => sum + Number(p.file_count || 0), 0);
      const totalChunks = projects.reduce((sum, p) => sum + Number(p.chunk_count || 0), 0);
      console.log(`• Total Indexed Files:       ${totalFiles}`);
      console.log(`• Total Code Chunks:         ${totalChunks}\n`);
    } catch (err: any) {
      console.error('Error getting status:', err?.message || err);
      process.exit(1);
    } finally {
      await closeDbPool();
    }
  });

// MCP Server Command
program
  .command('mcp')
  .description('Start Model Context Protocol (MCP) server over stdio for Google Antigravity')
  .action(async () => {
    const server = new CodeContextMcpServer();
    await server.start();
  });

// Local Admin Dashboard Command
program
  .command('dashboard')
  .description('Start the Local Admin Dashboard web server')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-h, --host <host>', 'Host address to bind to', '127.0.0.1')
  .action(async (opts) => {
    try {
      const { startDashboardServer } = await import('../server/app.js');
      const port = Number(opts.port) || 3000;
      const host = opts.host || '127.0.0.1';
      const { url } = await startDashboardServer(port, host);
      console.log('\n======================================================');
      console.log('       code-context-mcp Local Admin Dashboard          ');
      console.log('======================================================');
      console.log(` ✔ Dashboard running at: ${url}`);
      console.log(` ✔ Initial credentials:  admin / admin123`);
      console.log(' Press Ctrl+C to stop the dashboard server.\n');
    } catch (err: any) {
      console.error('Failed to start dashboard server:', err?.message || err);
      process.exit(1);
    }
  });

program.parse(process.argv);

