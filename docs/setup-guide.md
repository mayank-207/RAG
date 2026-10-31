# Installation & Setup Guide (Windows & Linux)

This guide walks through configuring and running `code-context-mcp` locally on both Windows and Linux developer machines.

---

## Prerequisites

1. **Node.js**: v20 or v22 LTS (Active: v22.23.2).
2. **MySQL**: 8.4 Community Server (Active: MySQL 8.4.3).
3. **Qdrant**: v1.11+ (Local vector database).
4. **Ollama**: v0.3+ (Local embedding model server).
5. **Git**: v2.40+.

---

## 1. Relational Database Setup (MySQL 8.4)

### On Windows (Laragon or Standalone MySQL 8.4)
1. Ensure MySQL 8.4 service is running (e.g. through Laragon menu -> Start All, or Windows Services).
2. Create the dedicated database `code_context_mcp`:
   ```sql
   CREATE DATABASE IF NOT EXISTS code_context_mcp
     CHARACTER SET utf8mb4
     COLLATE utf8mb4_unicode_ci;
   ```
3. Verify connection:
   ```bash
   mysql -u root -e "SHOW DATABASES LIKE 'code_context_mcp';"
   ```

### On Linux (Ubuntu / Debian)
1. Install MySQL 8.4:
   ```bash
   sudo apt update
   sudo apt install mysql-server
   sudo systemctl enable --now mysql
   ```
2. Create database and user:
   ```sql
   CREATE DATABASE IF NOT EXISTS code_context_mcp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER IF NOT EXISTS 'rag_user'@'localhost' IDENTIFIED BY 'secure_password';
   GRANT ALL PRIVILEGES ON code_context_mcp.* TO 'rag_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

---

## 2. Vector Database Setup (Qdrant)

Qdrant stores dense vector embeddings for semantic search.

### On Windows:
Option A: Run standalone Qdrant binary from Qdrant GitHub releases (`qdrant.exe`):
```powershell
# In PowerShell:
./qdrant.exe --storage-snapshot local-data/qdrant_storage
```
Option B: Run via Docker (if Docker Desktop is installed):
```bash
docker run -d -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage:z qdrant/qdrant
```

### On Linux:
```bash
curl -LO https://github.com/qdrant/qdrant/releases/latest/download/qdrant-x86_64-unknown-linux-gnu.tar.gz
tar -xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
./qdrant
```
Verify Qdrant is running:
```bash
curl http://127.0.0.1:6333/healthz
# Response: 200 OK
```

---

## 3. Local Embedding Setup (Ollama)

Ollama provides local vector embeddings without requiring paid cloud APIs.

### On Windows & Linux:
1. Download and install Ollama from [ollama.com](https://ollama.com/download).
2. Pull the recommended code embedding model:
   ```bash
   ollama pull nomic-embed-text
   ```
3. Start the Ollama server:
   ```bash
   ollama serve
   ```
4. Verify Ollama is running:
   ```bash
   curl http://127.0.0.1:11434/api/tags
   ```

---

## 4. Application Configuration

1. Clone or navigate to `code-context-mcp`:
   ```bash
   git checkout feature/initial-mcp-server
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Configure your MySQL credentials in `.env`:
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

4. Install dependencies:
   ```bash
   npm install
   ```

5. Run database migrations:
   ```bash
   npm run migrate
   ```

6. Verify system health:
   ```bash
   npm run health
   ```

7. Start the Local Admin Dashboard:
   ```bash
   npm run dashboard
   ```
   Open **http://127.0.0.1:3000** in your browser.
   Sign in with `admin` / `admin123`.

---

## 5. Quick Start Example

1. Start the Admin Dashboard:
   ```bash
   npm run dashboard
   ```
   Or manage via CLI:

2. Register a project:
   ```bash
   npm run project:add -- --id my-app --name "My Laravel App" --path "C:/path/to/my-app" --framework laravel
   ```
3. Run full index:
   ```bash
   npm run index:full -- --project my-app
   ```
4. Test search:
   ```bash
   npm run search -- --project my-app --query "User authentication controller"
   ```
5. Start MCP server:
   ```bash
   npm run mcp
   ```

