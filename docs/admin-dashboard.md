# Local Admin Dashboard Guide

The **Local Admin Dashboard** is a built-in, responsive web interface for `code-context-mcp`. It provides developers with full visibility and control over registered codebases, indexing jobs, AST-extracted symbols, chunk segments, dependency graphs, AI model providers, and system health.

---

## 1. Quick Start

### Starting the Dashboard

Start the dashboard web server from the repository root:

```bash
npm run dashboard
```

Or specify custom port and host:

```bash
# via CLI command directly
npm run dashboard -- --port 3000 --host 127.0.0.1

# or using the CLI executable
npx tsx src/cli/index.ts dashboard -p 3000 -h 127.0.0.1
```

Once started, open your browser at:
[http://127.0.0.1:3000](http://127.0.0.1:3000)

### Initial Login Credentials

| Setting | Default Value | Notes |
|---|---|---|
| **Username** | `admin` | Configured in `ADMIN_INITIAL_USERNAME` |
| **Password** | `admin123` | Configured in `ADMIN_INITIAL_PASSWORD` |
| **Session Lifetime** | 7 days | Stored in secure `HttpOnly` cookie or Bearer token |

> **Security Note:** You can change your password immediately after signing in or customize `ADMIN_INITIAL_PASSWORD` in your local `.env`.

---

## 2. Dashboard Architecture & Views

The dashboard is built as an independent Single-Page Application (SPA) served directly by Express without remote CDNs or external dependencies.

```
┌────────────────────────────────────────────────────────┐
│                   code-context-mcp                     │
│               Local Admin Dashboard                    │
├─────────────────┬──────────────────────────────────────┤
│ CORE            │ TOPBAR: MySQL 8.4 • Qdrant • Ollama  │
│ • Dashboard     ├──────────────────────────────────────┤
│ • Projects      │ MAIN VIEW CONTENT                    │
│                 │ • Real-time database metrics         │
│ CODE EXPLORER   │ • Interactive project management     │
│ • Indexed Files │ • Search & inspect AST symbols       │
│ • Code Chunks   │ • Code snippet & line viewer         │
│ • Symbols       │ • Dependency relationship graph      │
│ • Dependencies  │ • AI Provider setup & key encryption │
│                 │ • Strict embedding isolation         │
│ ENGINE & AI     │ • System diagnostics & error logs    │
│ • Indexing      │                                      │
│ • AI Models     │                                      │
│ • Embeddings    │                                      │
│ • System & Logs │                                      │
└─────────────────┴──────────────────────────────────────┘
```

---

## 3. Detailed View Breakdown

### 1. Dashboard Overview (`#dashboard`)
Displays high-level statistics calculated live from MySQL 8.4 and vector storage:
- **Summary Cards**:
  - Registered vs Connected Codebases
  - Indexed Projects vs Pending
  - Total Indexed Files across all workspaces
  - Total Code Chunks & Synced Vector Embeddings
  - Total Extracted Symbols (classes, methods, hooks, routes)
  - Last Successful Index timestamp & active AI model
- **Registered Codebases Quick View**: Table of projects with status indicators (`Indexed`, `Pending`, `Disconnected`).
- **Live Service Health List**: Real-time status for MySQL 8.4, Qdrant, Ollama, and MCP stdio transport.

### 2. Project Management (`#projects`)
Manage all registered local codebases:
- **Register New Project Modal**:
  - Absolute Path (e.g. `C:/laragon/www/crm`)
  - Project Display Name
  - Framework (auto-detect, Laravel, React, Node, Generic)
  - Description notes
- **Project Actions**:
  - **View/Inspect**: Opens detailed project drawer/tab.
  - **Sync (Incremental Index)**: Scans modified and new files (fast).
  - **Full Index**: Complete re-parse and chunk regeneration.
  - **Remove**: Deletes registration without touching original code files. Option to purge local vector cache.

### 3. Project Details (`#project-detail/:id`)
Deep-dive into a specific project with dedicated sub-tabs:
1. **Overview**: Project metadata, Git status (branch, commit hash, uncommitted files), framework, and counts.
2. **Files**: Table of scanned files with language tags, sizes, and last index times.
3. **Chunks**: Preview of all code chunks created for this project.
4. **Symbols**: List of classes, methods, functions, and models discovered.
5. **Dependencies**: Caller-callee, route-controller, and model linkages.
6. **Indexing History**: Historical jobs, durations, files scanned, chunks indexed.
7. **Errors & Logs**: Indexing exceptions or parser warnings for this project.

### 4. Indexed Files Management (`#files`)
- Search files by relative path.
- Filter by project and file extension (`.php`, `.ts`, `.tsx`, `.js`, `.sql`, `.md`).
- View line count, chunk segmentation, and size.
- **Single File Reindex**: Trigger re-parsing of an individual file on-demand.

### 5. Code Chunks & Snippets (`#chunks`)
- Search chunks by symbol name, file path, or code content.
- Filter by chunk type (`method`, `function`, `class`, `component`, `hook`, `doc_section`).
- Embedding sync status indicator (`synced`, `pending`, `failed`).
- **Chunk Inspector Modal**: Click "Inspect" to view the full source code snippet, line ranges, and chunk ID.

### 6. Code Symbols (`#symbols`)
- AST-extracted symbols across all codebases.
- Search symbol name or signature.
- Filter by kind (`class`, `method`, `function`, `component`, `hook`, `model`, `controller`).
- Displays namespace, parent class, line range, and parameter signature.

### 7. Dependency & Impact Graph (`#dependencies`)
- Visual table of extracted relationships:
  - Route -> Controller (`calls_controller`)
  - Controller -> Model (`queries_model`)
  - Component -> Import (`imports`)
  - Class -> Extends (`inherits`)
- Live search to find all affected upstream and downstream components.

### 8. Indexing Management (`#indexing`)
- **Trigger Form**: Select project and mode (`incremental` or `full`) and trigger indexing with live status feedback.
- **Jobs History**: Chronological audit log of all indexing runs with duration in seconds/minutes, scanned counts, chunks generated, and vector counts.

### 9. AI Model Providers (`#ai-models`)
- Configure and manage LLM providers:
  - OpenAI (GPT-4o, GPT-4o-mini, etc.)
  - Google Gemini (Gemini 1.5 Pro, Flash)
  - Anthropic (Claude 3.5 Sonnet, Haiku)
  - Local Ollama (Local LLM inference)
  - Custom OpenAI-Compatible endpoints
- **API Key Security**: Keys are encrypted using AES-256-GCM. Plaintext keys are never returned or rendered; only masked strings (`sk-••••1234`) are shown.
- **Live Connection Test**: Click "Test Connection" to test credentials and measure round-trip latency.
- **Task Assignments**: Assign different models to specialized tasks (e.g. `code_analysis`, `context_ranking`, `query_reformulation`, `architectural_reasoning`).

### 10. Embedding Settings (`#embedding-settings`)
- Isolated configuration for vector embeddings.
- Configures Ollama model (`nomic-embed-text`, `all-minilm`), vector dimensions (`768`, `384`), and batch sizes.
- Strict isolation: Changing chat generation models never alters vector embedding settings.

### 11. System Settings & Diagnostics (`#system`)
- Live diagnostics for:
  - MySQL 8.4: Host, port, database name, connection status, version.
  - Qdrant: REST endpoint, collection names, point counts.
  - Ollama: Local endpoint, active embedding model, installed model list.
  - MCP Server: Transport mode (`stdio`), tool registration status.
  - Local Storage: Cache and log directory paths.

### 12. Error Logs & Retrievals (`#logs`)
- Live stream of parser and indexing errors with stack traces.
- Query history of RAG retrievals showing query terms, execution time, and chunk counts.

---

## 4. REST API Reference

All `/api/*` endpoints (except `/api/auth/login`) require authentication via `Authorization: Bearer <token>` or session cookie.

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Authenticate admin (`{ username, password }`) |
| `GET` | `/api/auth/me` | Current session user |
| `POST` | `/api/auth/logout` | Invalidate session |
| `GET` | `/api/dashboard/stats` | Summary statistics and service health |
| `GET` | `/api/projects` | List all registered projects with stats |
| `POST` | `/api/projects` | Register new project |
| `GET` | `/api/projects/:id` | Project detail, git status, workspaces, jobs |
| `DELETE` | `/api/projects/:id` | Remove project registration (optional `?purgeIndexOnly=true`) |
| `POST` | `/api/projects/:id/index` | Trigger indexing job (`{ mode: 'incremental' | 'full' }`) |
| `GET` | `/api/files` | Search & paginate indexed files |
| `POST` | `/api/files/:id/reindex` | Re-parse individual file |
| `GET` | `/api/chunks` | Search & paginate code chunks |
| `GET` | `/api/chunks/:id` | Single chunk detail & full content |
| `GET` | `/api/symbols` | Search AST symbols |
| `GET` | `/api/dependencies` | Search dependency graph edges |
| `GET` | `/api/indexing/jobs` | Indexing history |
| `GET` | `/api/ai/providers` | Configured AI providers with masked keys |
| `POST` | `/api/ai/providers` | Add or update AI provider |
| `POST` | `/api/ai/providers/:id/test` | Test provider connection & latency |
| `DELETE` | `/api/ai/providers/:id` | Delete provider |
| `GET` | `/api/ai/assignments` | Task model assignments |
| `PUT` | `/api/ai/assignments` | Update model assignment |
| `GET` | `/api/ai/embedding-settings` | Current vector embedding configuration |
| `PUT` | `/api/ai/embedding-settings` | Update embedding settings |
| `GET` | `/api/system/settings` | Live service diagnostics |
| `GET` | `/api/logs` | Error and retrieval logs |

