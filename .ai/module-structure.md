# Module Structure

```text
src/
├── config/           # Configuration management (Zod validation, .env loader)
├── utils/            # Logger, file helpers, sha256 hashing, process lock
├── db/               # MySQL 8.4 pool, query helpers, migration runner
│   └── migrations/   # Migration files
├── parsers/          # Language parsers
│   ├── php.ts        # PHP / Laravel AST parser
│   ├── javascript.ts # JS / TS / React AST parser
│   ├── sql.ts        # SQL migration parser
│   └── markdown.ts   # .ai/ knowledge parser
├── indexer/          # Codebase chunker, file scanner, orchestrator
│   ├── scanner.ts    # File walker respecting .gitignore & secret rules
│   ├── chunker.ts    # AST-aware code block chunker
│   └── indexer.ts    # Incremental indexing coordinator
├── vectors/          # Qdrant client & collection manager
├── embeddings/       # Ollama REST client & batch generator
├── impact/           # Dependency graph builder & impact analyzer
├── search/           # Hybrid RAG search engine (Exact, FULLTEXT, Vector, Fusion)
├── projects/         # Project registration & workspace isolation
├── mcp/              # MCP Server definition & tool handlers
└── cli/              # Command line commands
```

