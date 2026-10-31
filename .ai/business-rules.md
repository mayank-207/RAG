# Business Rules & Constraints

## Rule 1: Zero Modification of Target Projects
- The system operates strictly as a read-only indexer.
- It must NEVER write, modify, delete, format, or install dependencies within registered developer repositories.

## Rule 2: Absolute Relational Database Restriction
- MySQL 8.4 is the ONLY relational database permitted.
- SQLite is forbidden anywhere in the codebase (not as fallback, cache, or temporary storage).
- PostgreSQL is forbidden.

## Rule 3: Strict Project and Workspace Isolation
- A search query executed against Project A must NEVER return files, chunks, symbols, or dependencies from Project B.
- Uncommitted changes in Workspace 1 must NEVER bleed into Workspace 2.

## Rule 4: Secret and Credential Blacklist
- The indexer must refuse to index `.env`, certificates (`.pem`, `.crt`), private keys (`*.key`, `id_rsa`), and tokens.
- Binary files (images, audio, zip, executables) must be skipped.

## Rule 5: Local Execution Only
- No mandatory external paid AI APIs (OpenAI, Gemini API, etc.) for core retrieval or indexing.
- Embeddings must be generated locally via Ollama.
