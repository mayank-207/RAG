# code-context-mcp

**code-context-mcp** is a standalone, local-first RAG (Retrieval-Augmented Generation) and Model Context Protocol (MCP) code context server for AI coding assistants such as **Google Antigravity**.

It indexes local developer codebases, builds lexical and AST-level symbol indexes in **MySQL 8.4**, manages dense semantic vector embeddings in **Qdrant**, and generates embeddings locally using **Ollama** (`nomic-embed-text`).

---

## 1. Features

- **Local-First & Zero Egress**: Your code never leaves your local workstation. No external paid AI APIs required.
- **Strict Project & Workspace Isolation**: Cleanly separates multiple client projects (Laravel, React, Node.js). Workspace results (branches, uncommitted working directories) never bleed into other projects.
- **AST-Aware Code Understanding**:
  - **PHP / Laravel**: Models, controllers, routes, migrations, Eloquent relationships (`hasMany`, `belongsTo`), middleware, policies.
  - **React / TypeScript / JavaScript**: Components, custom hooks, imports, exports, routes, API calls (`fetch`, `axios`).
  - **SQL**: Database tables, columns, primary and foreign key references.
  - **Curated Project Memory (`.ai/`)**: Architecture rules, business decisions, coding standards.
- **Hybrid RAG Retrieval**: Weighted Reciprocal Rank Fusion (RRF) combining exact symbol lookups, file path matches, MySQL 8.4 FULLTEXT queries, Qdrant semantic vectors, and dependency graph expansion.
- **Dependency Graph & Impact Analysis**: Understands route-to-controller, controller-to-model, component-to-child-component relationships. Answers "What files will break or need modification if I touch entity X?".
- **Git Awareness**: Automatically tracks branch commits, uncommitted modifications, and newly added files in your working tree.
- **Safety & Secret Protection**: Strict blacklist prevents indexing `.env`, private keys (`*.pem`, `*.key`, `id_rsa`), tokens, and binaries. Target repositories are opened in strictly **read-only** mode.

---

## 2. Technology Stack

| Component     | Technology                           | Role                                                                        |
| ------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| Runtime       | Node.js (v20+ / v22+)                | Application engine                                                          |
| Language      | TypeScript 5.7+                      | Strict ES module codebase                                                   |
| Protocol      | Official `@modelcontextprotocol/sdk` | MCP stdio integration                                                       |
| Relational DB | **MySQL 8.4**                        | **Sole relational store** (entities, symbols, FULLTEXT, routes, migrations) |
| Vector DB     | Qdrant                               | Dense chunk embeddings & semantic nearest-neighbor search                   |
| Embeddings    | Ollama (`nomic-embed-text`)          | Local 768-dimensional vector generation                                     |
| Parsers       | `php-parser`, `@babel/parser`        | AST-level symbol extraction                                                 |
| Testing       | Vitest                               | Integration & unit test suite                                               |

> **Note on Database Rule**: MySQL 8.4 is the only relational database used. SQLite and PostgreSQL are never used in this project.

---

## 3. System Requirements & Prerequisites

1. **Node.js**: v20 or v22 (Active: v22.23.2).
2. **MySQL**: 8.4 Community Server (Active: MySQL 8.4.3).
3. **Qdrant**: Local vector database instance (port 6333).
4. **Ollama**: Local embedding model server (port 11434).
5. **Git**: v2.40+.

---

## 4. Quick Start & Setup

### 4.1. Clone Repository & Install Dependencies

```bash
git checkout feature/initial-mcp-server
npm install
```

### 4.2. MySQL 8.4 Database Setup

Create the dedicated database in your local MySQL 8.4 instance:

```sql
CREATE DATABASE IF NOT EXISTS code_context_mcp
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

### 4.3. Vector Database (Qdrant) Setup

Run Qdrant locally on port 6333:

- **Via Docker**:
  ```bash
  docker run -d -p 6333:6333 -v qdrant_storage:/qdrant/storage:z qdrant/qdrant
  ```
- **Via Standalone Binary**:
  Download `qdrant.exe` from [Qdrant Releases](https://github.com/qdrant/qdrant/releases) and run:
  ```powershell
  ./qdrant.exe
  ```

### 4.4. Local Embeddings (Ollama) Setup

1. Install Ollama from [ollama.com](https://ollama.com/download).
2. Pull the recommended embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Start the Ollama server:
   ```bash
   ollama serve
   ```

### 4.5. Environment Configuration

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure your `.env` contains your local credentials:

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=code_context_mcp

QDRANT_URL=http://127.0.0.1:6333
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_EMBED_MODEL=nomic-embed-text
```

### 4.6. Run Database Migrations

```bash
npm run migrate
```

Check status:

```bash
npm run db:status
```

### 4.7. Verify Services Health

```bash
npm run health
```

---

## 5. Local Admin Dashboard

`code-context-mcp` includes a built-in, responsive web management interface.

### Launching the Dashboard

```bash
npm run dev
# or
npm run dashboard
```

Or specify custom port and host:

```bash
npm run dashboard -- --port 3000 --host 127.0.0.1
```

Open your browser at: **[http://127.0.0.1:3000](http://127.0.0.1:3000)**

- **Default Username:** `admin`
- **Default Password:** `admin123`

### Dashboard Capabilities:
- **Project Management**: Register local codebases, inspect Git status (branch, commit hash, uncommitted files), trigger incremental/full indexing, and purge index data without modifying source files.
- **Code Explorer**: Search indexed files, view segmented code chunks with line ranges, inspect full code snippets, and search AST-extracted symbols (classes, methods, hooks, routes).
- **Dependency Graph**: Visualize linkages between routes and controllers, controllers and models, components and imports.
- **AI Provider Configuration**: Configure OpenAI, Google Gemini, Anthropic Claude, and local Ollama. API keys are encrypted at rest with **AES-256-GCM** and displayed securely masked (`sk-••••1234`).
- **Task-Specific Model Assignments**: Assign different AI models to specialized assistant tasks (code analysis, context ranking, query expansion, architectural impact).
- **Embedding Isolation**: Manage vector embeddings independently from generative models to avoid collection corruption.
- **Live Diagnostics**: Real-time health monitoring for MySQL 8.4, Qdrant, Ollama, and MCP stdio transport, plus error logs and retrieval query audit.

For comprehensive documentation, see [docs/admin-dashboard.md](docs/admin-dashboard.md).

---

## 6. Registering and Indexing Projects (CLI)

### Register a Project

```bash
npm run project:add -- --id engineering-crm --name "Engineering CRM" --path "C:/path/to/engineering-crm" --framework laravel
```

### List Registered Projects

```bash
npm run project:list
```

### Run Full Indexing

```bash
npm run index:full -- --project engineering-crm
```

### Run Incremental Indexing

Only processes added, modified, or deleted files:

```bash
npm run index:incremental -- --project engineering-crm
```

### Watch Mode

Automatically updates the index as files are saved:

```bash
npm run index:watch -- --project engineering-crm
```

---

## 6. CLI Search and Context Inspection

### Hybrid Code Search

```bash
npm run search -- --project engineering-crm --query "Project budget validation"
```

### Full AI Task Context

```bash
npm run context -- --project engineering-crm --task "Add department-based permission checking to project creation"
```

### Dependency Impact Analysis

```bash
npm run impact -- --project engineering-crm --target "Project"
```

---

## 7. Connecting to Google Antigravity (MCP)

Add the following to your Google Antigravity MCP settings (`mcp_config.json`):

```json
{
  "mcpServers": {
    "code-context-mcp": {
      "command": "node",
      "args": ["C:/laragon/www/RAG/dist/cli/index.js", "mcp"],
      "env": {
        "NODE_ENV": "production",
        "DB_HOST": "127.0.0.1",
        "DB_PORT": "3306",
        "DB_USER": "root",
        "DB_PASSWORD": "",
        "DB_NAME": "code_context_mcp",
        "QDRANT_URL": "http://127.0.0.1:6333",
        "OLLAMA_URL": "http://127.0.0.1:11434",
        "OLLAMA_EMBED_MODEL": "nomic-embed-text",
        "LOCAL_DATA_DIR": "C:/laragon/www/RAG/local-data",
        "APP_LOG_LEVEL": "info"
      }
    }
  }
}
```

### MCP Tools Exposed

1. **`get_task_context`**: Complete pre-coding briefing. Retrieves business rules, code snippets with exact line ranges, related models, routes, database tables, and tests.
2. **`search_code`**: Multi-modal search (exact, full-text, semantic) with strict project isolation.
3. **`get_impact`**: Downstream dependency impact analysis when modifying a symbol, class, or file.
4. **`index_status`**: Real-time health, indexing stats, and service synchronization status.

---

## 8. Automated Testing

Run the automated test suite:

```bash
npm test
```

The test suite includes 38 unit and integration tests verifying:

- PHP / Laravel AST parsing (classes, methods, relationships, routes, migrations)
- React / TypeScript AST parsing (components, hooks, imports, JSX elements)
- SQL schema parsing (tables, columns, primary & foreign keys)
- Markdown & `.ai/` curated memory parsing
- Secret and credential exclusion (`.env`, `*.key`, `id_rsa`)
- Path traversal protection
- Project and workspace isolation in MySQL 8.4
- FULLTEXT and hybrid search
- Dependency graph impact analysis
- MCP tool JSON-RPC contracts
- Local Admin Dashboard REST endpoints, PBKDF2 authentication, and session tokens
- AES-256-GCM API key encryption, masking, and AI provider testing

---

## 9. Documentation Index

- [docs/requirements.md](docs/requirements.md): Complete requirements and architectural decisions.
- [docs/architecture.md](docs/architecture.md): Complete system architecture and component designs.
- [docs/admin-dashboard.md](docs/admin-dashboard.md): Local Admin Dashboard user guide and REST API reference.
- [docs/ai-model-configuration.md](docs/ai-model-configuration.md): AI provider setup, model assignments, and embedding isolation.
- [docs/security.md](docs/security.md): Cryptography, AES-256-GCM encryption, and local-first security.
- [docs/database-schema.md](docs/database-schema.md): MySQL 8.4 schema documentation and ER diagram.
- [docs/setup-guide.md](docs/setup-guide.md): Step-by-step local workstation setup guide.
- [docs/rag-flow.md](docs/rag-flow.md): Indexing, parsing, chunking, and search pipeline.
- [docs/mcp-setup.md](docs/mcp-setup.md): Google Antigravity MCP integration instructions.
- [docs/development-guide.md](docs/development-guide.md): Developer guide for extending code-context-mcp.
- [docs/setup-guide.md](docs/setup-guide.md): Step-by-step setup on Windows and Linux.
- [docs/development-guide.md](docs/development-guide.md): Directory structure, coding conventions, and developer workflows.
- [docs/mcp-setup.md](docs/mcp-setup.md): Guide for connecting to Google Antigravity.
- [docs/rag-flow.md](docs/rag-flow.md): In-depth walkthrough of chunking, vector storage, and hybrid retrieval.

=====================================

# Check database migration status & apply migrations

npm run db:status
npm run migrate

# Check local services connectivity (MySQL 8.4, Qdrant, Ollama)

npm run health

# Register a codebase

npm run project:add -- --id crm --name "CRM Application" --path "C:/laragon/www/crm" --framework laravel

# Index codebase (full or incremental)

npm run index:full -- --project crm
npm run index:incremental -- --project engineering-crm

# Search code & inspect AI task context

npm run search -- --project engineering-crm --query "Project budget validation"
npm run context -- --project engineering-crm --task "Add department permission checking"
npm run impact -- --project engineering-crm --target "Project"

# Start the MCP server (for Google Antigravity)

npm run mcp
