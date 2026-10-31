import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load .env file
dotenv.config();

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // MySQL 8.4 Database Configuration
  db: z.object({
    host: z.string().default('127.0.0.1'),
    port: z.coerce.number().default(3306),
    user: z.string().default('root'),
    password: z.string().default(''),
    database: z.string().default('code_context_mcp'),
    connectionLimit: z.coerce.number().default(10),
  }),

  // Qdrant Vector Database
  qdrant: z.object({
    url: z.string().default('http://127.0.0.1:6333'),
    apiKey: z.string().optional().default(''),
    collectionPrefix: z.string().default('code_chunks'),
  }),

  // Ollama Embeddings
  ollama: z.object({
    url: z.string().default('http://127.0.0.1:11434'),
    model: z.string().default('nomic-embed-text'),
    dimensions: z.coerce.number().default(768),
    batchSize: z.coerce.number().default(32),
  }),

  // Local Storage Directory
  localDataDir: z.string().default('./local-data'),

  // MCP Server Info
  mcp: z.object({
    serverName: z.string().default('code-context-mcp'),
    serverVersion: z.string().default('1.0.0'),
  }),

  // Search & Retrieval Tuning
  search: z.object({
    exactWeight: z.coerce.number().default(0.35),
    fulltextWeight: z.coerce.number().default(0.35),
    vectorWeight: z.coerce.number().default(0.30),
    maxResults: z.coerce.number().default(20),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  const rawConfig = {
    nodeEnv: process.env.NODE_ENV,
    logLevel: process.env.APP_LOG_LEVEL,
    db: {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      connectionLimit: process.env.DB_CONNECTION_LIMIT,
    },
    qdrant: {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionPrefix: process.env.QDRANT_COLLECTION_PREFIX,
    },
    ollama: {
      url: process.env.OLLAMA_URL,
      model: process.env.OLLAMA_EMBED_MODEL,
      dimensions: process.env.OLLAMA_EMBED_DIMENSIONS,
      batchSize: process.env.OLLAMA_BATCH_SIZE,
    },
    localDataDir: process.env.LOCAL_DATA_DIR,
    mcp: {
      serverName: process.env.MCP_SERVER_NAME,
      serverVersion: process.env.MCP_SERVER_VERSION,
    },
    search: {
      exactWeight: process.env.SEARCH_EXACT_WEIGHT,
      fulltextWeight: process.env.SEARCH_FULLTEXT_WEIGHT,
      vectorWeight: process.env.SEARCH_VECTOR_WEIGHT,
      maxResults: process.env.SEARCH_MAX_RESULTS,
    },
  };

  const parsed = configSchema.safeParse(rawConfig);
  if (!parsed.success) {
    console.error('Invalid application configuration:', parsed.error.format());
    throw new Error('Configuration validation failed');
  }

  // Ensure absolute path for local data dir
  parsed.data.localDataDir = path.resolve(process.cwd(), parsed.data.localDataDir);

  return parsed.data;
}

export const config = loadConfig();
