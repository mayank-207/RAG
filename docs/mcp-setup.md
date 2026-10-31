# Google Antigravity MCP Setup Guide

This guide explains how to connect `code-context-mcp` to Google Antigravity or any Model Context Protocol compliant client.

---

## 1. Overview of MCP Transport
`code-context-mcp` communicates via the standard `stdio` transport. When Google Antigravity starts, it launches the MCP server process locally as a child process and communicates via JSON-RPC over stdin/stdout.

All diagnostic logs from the server are routed to `stderr` or structured log files in `local-data/logs/` so they never interfere with JSON-RPC communication on `stdout`.

---

## 2. Antigravity Configuration

To configure Google Antigravity to use `code-context-mcp`, add the server to your Antigravity MCP configuration file (`mcp_config.json` or through the Antigravity Settings UI):

```json
{
  "mcpServers": {
    "code-context-mcp": {
      "command": "node",
      "args": [
        "c:/laragon/www/RAG/dist/cli/index.js",
        "mcp"
      ],
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
        "LOCAL_DATA_DIR": "c:/laragon/www/RAG/local-data",
        "APP_LOG_LEVEL": "info"
      }
    }
  }
}
```

> **Tip for TypeScript Direct Execution during Development:**
> If you prefer running without building, you can use `npx tsx`:
> ```json
> "command": "npx",
> "args": [
>   "tsx",
>   "c:/laragon/www/RAG/src/cli/index.ts",
>   "mcp"
> ]
> ```

---

## 3. Available MCP Tools

Once connected, Google Antigravity will discover the following tools:

### `get_task_context`
- **Purpose**: Call this before planning or writing any code. Retrieves full context for a developer's task.
- **Arguments**:
  - `project`: (string, required) Project ID or project name (e.g., `engineering-crm`).
  - `task_description`: (string, required) The task prompt or feature/bug to solve.
  - `workspace`: (string, optional) Target workspace or branch (defaults to active working copy).
  - `relevant_files`: (array of strings, optional) Specific files the user mentioned.
- **Output**:
  - Relevant business rules from `.ai/`.
  - Matching code chunks with exact file paths and line ranges.
  - Related symbols, controllers, and models.
  - Database schema tables and foreign key relationships.
  - Test files covering the affected area.
  - Architectural gotchas and warnings.

### `search_code`
- **Purpose**: Search code across the codebase using hybrid lexical and semantic search.
- **Arguments**:
  - `query`: (string, required) Search query (symbol name, concept, natural language question).
  - `project`: (string, required) Project ID or name.
  - `workspace`: (string, optional) Target workspace.
  - `symbol_type`: (string, optional) Filter by `class`, `method`, `function`, `component`, etc.
  - `limit`: (number, optional) Maximum items to return (default: 10).

### `get_impact`
- **Purpose**: Analyze the dependency radius and downstream impact of modifying a symbol or file.
- **Arguments**:
  - `project`: (string, required) Project ID or name.
  - `target`: (string, required) Class name, method, or relative file path (e.g. `User` or `app/Models/User.php`).
  - `workspace`: (string, optional) Target workspace.
- **Output**:
  - Direct dependents (files/classes importing or calling the target).
  - Indirect downstream dependents.
  - Related controllers, routes, tests, and database tables.
  - Distinction between confirmed AST dependencies and inferred relationships.

### `index_status`
- **Purpose**: Inspect the current indexing state, file counts, vector sync status, and health.
- **Arguments**:
  - `project`: (string, optional) Filter by project ID.
- **Output**:
  - List of registered projects.
  - Total files indexed and chunks generated.
  - MySQL, Qdrant, and Ollama status.
  - Last indexing timestamp and errors/warnings.

---

## 4. Verification

To verify that the MCP server runs and responds to standard JSON-RPC:
```bash
npm run mcp
```
The server will start and wait for standard input JSON-RPC messages (e.g. `tools/list`).

