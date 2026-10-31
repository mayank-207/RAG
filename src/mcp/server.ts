import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { config } from '../config/index.js';
import { ProjectManager } from '../projects/manager.js';
import { ContextBuilder } from './context.js';
import { HybridSearch } from '../search/hybrid.js';
import { ImpactGraph } from '../impact/graph.js';
import { query } from '../db/connection.js';
import { ollamaClient } from '../embeddings/ollama.js';
import { qdrantManager } from '../vectors/qdrant.js';
import { logger } from '../utils/logger.js';

export class CodeContextMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: config.mcp.serverName,
        version: config.mcp.serverVersion,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_task_context',
            description: 'Provides a complete contextual briefing for a developer task before implementing features or fixing bugs. Includes relevant business rules, code chunks with line ranges, models, routes, database tables, and tests.',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Project ID or name (e.g. engineering-crm)' },
                task_description: { type: 'string', description: 'Detailed developer task description or bug report' },
                workspace: { type: 'string', description: 'Optional workspace or branch name (defaults to active working-copy)' },
                relevant_files: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Optional file paths mentioned by the developer',
                },
              },
              required: ['project', 'task_description'],
            },
          },
          {
            name: 'search_code',
            description: 'Performs multi-channel hybrid search (exact symbols, paths, full-text keywords, and semantic vector similarity) with project isolation.',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search query, function name, concept, or question' },
                project: { type: 'string', description: 'Project ID or name' },
                workspace: { type: 'string', description: 'Optional workspace name' },
                symbol_type: { type: 'string', description: 'Optional symbol filter (class, method, function, component, hook)' },
                limit: { type: 'number', description: 'Maximum results to return (default: 10)' },
              },
              required: ['query', 'project'],
            },
          },
          {
            name: 'get_impact',
            description: 'Analyzes downstream impact and dependency radius if a file, class, method, or model is modified.',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Project ID or name' },
                target: { type: 'string', description: 'Class name, method name, or relative file path to analyze' },
                workspace: { type: 'string', description: 'Optional workspace name' },
              },
              required: ['project', 'target'],
            },
          },
          {
            name: 'index_status',
            description: 'Inspects codebase indexing health, file counts, vector sync status, and system diagnostics.',
            inputSchema: {
              type: 'object',
              properties: {
                project: { type: 'string', description: 'Optional project ID to inspect' },
              },
            },
          },
        ],
      };
    });

    // Handle tool invocations
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_task_context': {
            const project = String(args?.project || '');
            const taskDescription = String(args?.task_description || '');
            const workspace = args?.workspace ? String(args.workspace) : undefined;
            const relevantFiles = Array.isArray(args?.relevant_files) ? args?.relevant_files.map(String) : undefined;

            const context = await ContextBuilder.build({
              project,
              taskDescription,
              workspace,
              relevantFiles,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(context, null, 2),
                },
              ],
            };
          }

          case 'search_code': {
            const project = String(args?.project || '');
            const q = String(args?.query || '');
            const workspace = args?.workspace ? String(args.workspace) : undefined;
            const symbolType = args?.symbol_type ? String(args.symbol_type) : undefined;
            const limit = typeof args?.limit === 'number' ? args.limit : 10;

            const res = await HybridSearch.search({
              projectId: project,
              workspaceId: workspace,
              query: q,
              symbolType,
              limit,
            });

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(res, null, 2),
                },
              ],
            };
          }

          case 'get_impact': {
            const project = String(args?.project || '');
            const target = String(args?.target || '');
            const workspace = args?.workspace ? String(args.workspace) : undefined;

            const proj = await ProjectManager.getProject(project);
            if (!proj) throw new Error(`Project not found: ${project}`);
            const ws = await ProjectManager.getOrCreateWorkspace(proj.id, workspace);

            const impact = await ImpactGraph.analyzeImpact(proj.id, ws.id, target);

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(impact, null, 2),
                },
              ],
            };
          }

          case 'index_status': {
            const projectFilter = args?.project ? String(args.project) : undefined;
            const projects = await ProjectManager.listProjects();
            const filtered = projectFilter ? projects.filter((p) => p.id === projectFilter || p.name === projectFilter) : projects;

            const [ollamaHealth, qdrantHealth] = await Promise.all([
              ollamaClient.checkHealth(),
              qdrantManager.checkHealth(),
            ]);

            const [recentErrors] = await query<any[]>(
              'SELECT project_id, file_path, message, created_at FROM error_logs ORDER BY id DESC LIMIT 5'
            );

            const statusReport = {
              server: {
                name: config.mcp.serverName,
                version: config.mcp.serverVersion,
                nodeEnv: config.nodeEnv,
              },
              services: {
                mysql: { status: 'connected', version: '8.4' },
                qdrant: qdrantHealth,
                ollama: ollamaHealth,
              },
              registeredProjects: filtered.map((p) => ({
                id: p.id,
                name: p.name,
                path: p.root_path,
                framework: p.framework,
                filesIndexed: p.file_count,
                chunksCreated: p.chunk_count,
                lastIndexed: p.last_indexed,
              })),
              recentErrors: recentErrors || [],
            };

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(statusReport, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown MCP tool: ${name}`);
        }
      } catch (err: any) {
        logger.error({ err, tool: name }, 'Error executing MCP tool');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: err?.message || String(err) }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  public async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    logger.info('code-context-mcp server started via stdio transport.');
  }
}

