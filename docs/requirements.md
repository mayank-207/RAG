# Project Requirements: code-context-mcp

## 1. Project Overview & Mission
`code-context-mcp` is a completely independent, local-first RAG (Retrieval-Augmented Generation) and Model Context Protocol (MCP) code context server designed to empower AI coding assistants (such as Google Antigravity) with deep codebase intelligence.

The system indexes registered developer codebases, constructs full-text and semantic vector search indexes, tracks AST-level code symbols and dependencies, parses database migrations and application routes, indexes curated project memory (`.ai/` directory), and provides context to AI agents before coding begins.

## 2. Core Architectural & Technology Decisions
- **Application Runtime**: Node.js (v20+) with TypeScript (ES2022 / NodeNext modules).
- **Relational Database**: MySQL 8.4 Community Server ONLY.
  - *Strict Rule*: Under no circumstances should SQLite or PostgreSQL be introduced as a fallback, alternative, or temporary storage layer.
  - Transactions must be used for indexing operations requiring consistent relational updates.
  - Vector payloads are not stored in MySQL; only point identifiers, metadata, hashes, symbols, and relationships reside in MySQL.
- **Vector Database**: Qdrant (local instance).
  - Used for storing high-dimensional code chunk embeddings and semantic similarity searches.
  - Strict project and workspace isolation enforced via collection-level isolation or metadata filtering (`project_id` and `workspace_id`).
- **Embedding Generation**: Ollama (local execution).
  - Configurable model (defaulting to `nomic-embed-text` with 768 dimensions).
  - Local only; external paid APIs (OpenAI, Gemini API, etc.) are strictly optional and never mandatory for local indexing and retrieval.
- **MCP Protocol**: Official `@modelcontextprotocol/sdk` (stdio transport for local environments).
- **Git & Workspaces**:
  - Independent Git repository on branch `feature/initial-mcp-server`.
  - Supports multiple workspaces per project: Git branches, working directory revisions, committed and uncommitted local modifications.

## 3. Strict Deployment & Safety Restrictions
- **Zero Modification of Registered Projects**: The RAG server operates strictly in READ-ONLY mode on registered target repositories.
- **No Remote Deployment on CRM**: Never install, deploy, or run on CRM staging or production environments.
- **No Shared Mandatory RAG Server**: Every developer runs an isolated local stack (local MySQL, local Qdrant, local Ollama).
- **Exclusion of Secrets**: Strictly refuse to index `.env`, certificates, private keys (`*.pem`, `*.key`, `id_rsa`), passwords, tokens, and credentials.
- **Path Traversal Protection**: Enforce that file accesses never escape the registered project root directory.

## 4. Subsystem Requirements

### 4.1. MySQL Database Architecture
- Migration engine to manage schema versions cleanly.
- Normalized entities:
  - `projects`: ID, name, directory path, framework, language, branch, config.
  - `workspaces`: Project workspaces (branches / working directories).
  - `revisions`: Git commit hashes and snapshots.
  - `indexed_files`: File paths, content hashes, sizes, indexing timestamps, status.
  - `code_chunks`: Logical AST-derived code chunks with FULLTEXT index, symbol references, line numbers, and Qdrant point IDs.
  - `symbols`: Classes, methods, functions, interfaces, traits, components, hooks with line spans.
  - `code_dependencies`: Imports, component usages, method calls, service dependencies.
  - `routes`: Application route registrations, HTTP methods, URIs, controllers, actions, middleware.
  - `schema_tables` & `schema_columns`: Parsed database tables, primary keys, foreign keys, relationships from migrations.
  - `dependency_graph_edges`: Graph edges between routes, controllers, models, services, components.
  - `project_documents`: Markdown documents indexed from `.ai/` directory.
  - `curated_memory`: Approved business rules, architecture decisions, coding standards.
  - `indexing_jobs` & `indexing_logs`: Job statuses, error reporting, performance metrics.

### 4.2. Code Parsing & Chunking Engine
- AST parsers:
  - PHP / Laravel: Classes, methods, traits, interfaces, models, controllers, middleware, routes, migrations, relationships (`hasMany`, `belongsTo`), events, listeners, jobs, policies.
  - JavaScript / TypeScript / React: Functional & class components, hooks (`useState`, `useEffect`, custom hooks), exports, imports, API calls, routes.
  - SQL & Migrations: Table definitions, foreign key constraints, column types.
  - Markdown: `.ai/` documents, headings, sections, structured rules.
- Logical chunking preserving class/method boundaries. Bounded chunking with line reference preservation for oversized blocks.

### 4.3. Hybrid RAG Search
- Multi-channel retrieval combining:
  1. Exact identifier search (`symbols` table).
  2. File and path matching.
  3. MySQL FULLTEXT keyword search on `code_chunks`.
  4. Qdrant semantic vector search on embeddings.
  5. Dependency graph expansion.
  6. Curated `.ai` project memory.
- Reciprocal Rank Fusion (RRF) and weighted linear hybrid ranking to eliminate false positives.

### 4.4. Dependency Graph & Impact Analysis
- Forward and reverse dependency lookups.
- Impact analysis querying: "What is affected if entity X is modified?"
- Distinct labelling for confirmed AST dependencies vs. inferred keyword relationships.

### 4.5. Incremental Indexing & Git Awareness
- Hash-based change detection (SHA-256) per file and chunk.
- Index committed, uncommitted, and untracked changes in the developer's working directory.
- Stale vector cleanup in Qdrant when files or chunks are deleted or modified.
- Indexing locks to prevent concurrent write collisions.

### 4.6. MCP Tools Specification
- `get_task_context`: Complete pre-coding briefing (business rules, source files, related methods, dependencies, schema relationships, suggested implementation areas, tests, warnings).
- `search_code`: Multi-mode search returning snippets, line ranges, symbols, relevance scores, and dependencies.
- `get_impact`: Dependency impact analysis of a file, class, method, or symbol.
- `index_status`: Health, indexing statistics, Qdrant/Ollama/MySQL synchronization status.

### 4.7. CLI Management
Command-line interface with commands for:
- `db:migrate`, `db:status`
- `project:add`, `project:list`, `project:view`, `project:update`, `project:remove`
- `index:full`, `index:incremental`, `index:watch`
- `search`, `context`, `impact`, `status`, `health`, `mcp`

### 4.8. Testing & Verification
- Synthetic test fixtures for Laravel/PHP and React/TypeScript.
- End-to-end unit and integration tests covering migrations, parsing, chunking, search, impact, incremental changes, secret safety, and MCP tools.

