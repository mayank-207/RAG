# Development Guide: code-context-mcp

## 1. Directory Structure

```text
code-context-mcp/
├── src/
│   ├── cli/             # CLI commands (commander)
│   ├── config/          # Environment configuration & Zod schemas
│   ├── db/              # MySQL 8.4 connection pool & migration runner
│   │   └── migrations/  # SQL schema migrations
│   ├── embeddings/      # Ollama client & batch embedding generator
│   ├── impact/          # Dependency graph & impact analysis engine
│   ├── indexer/         # File scanner, AST parsers, chunker, orchestrator
│   ├── mcp/             # MCP server initialization & tool handlers
│   ├── parsers/         # Language AST parsers (PHP/Laravel, JS/TS/React, SQL, Markdown)
│   ├── projects/        # Project registry, workspace manager, git detection
│   ├── search/          # Hybrid search engine (Exact, FULLTEXT, Vector, Fusion)
│   ├── utils/           # Logger, filesystem helpers, hashing, lockfile
│   ├── vectors/         # Qdrant client & collection management
│   └── index.ts         # Library entry point
├── tests/
│   ├── fixtures/        # Synthetic sample projects (Laravel, React)
│   ├── unit/            # Unit tests for parsers, chunking, hashing
│   └── integration/     # Integration tests for search, migrations, MCP
├── docs/                # Architecture, schema, setup, MCP guides
├── .ai/                 # Curated project memory templates
├── .env.example         # Example configuration
├── .gitignore           # Git ignore definitions
├── package.json         # Dependencies and scripts
└── tsconfig.json        # TypeScript compiler options
```

---

## 2. Coding Conventions

- **Language & Runtime**: TypeScript 5.7+ targeting Node.js 22 with ES modules (`"type": "module"`).
- **Strict Typing**: All functions, variables, parameters, and return types must be explicitly typed (`strict: true`). No `any` without explicit justification.
- **Async / Await**: Use native promises throughout. Avoid callback pyramids.
- **Relational Integrity**: Use transactions for multi-statement writes. Prepared statements only; no string interpolation in SQL queries.
- **Safety First**:
  - Never execute scripts or binaries inside indexed projects.
  - Never modify files inside registered projects.
  - Reject paths attempting directory traversal (`..`).

---

## 3. Testing Workflow

The test suite uses **Vitest**.

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

Tests run against synthetic fixtures in `tests/fixtures/` and test:
- AST parsing of PHP classes, methods, Laravel routes, migrations, and Eloquent relationships.
- AST parsing of React components, hooks, imports, and exports.
- Chunking accuracy and line preservation.
- Hybrid search scoring and reciprocal rank fusion.
- Git uncommitted change detection and branch tracking.
- Secret exclusion filters.
- MCP tool JSON-RPC invocation.

---

## 4. Building & Running

- Build TypeScript into `dist/`:
  ```bash
  npm run build
  ```
- Direct execution without build (via `tsx`):
  ```bash
  npm run <command>
  ```

