# Security, Isolation & Key Management

`code-context-mcp` is designed as a local-first developer tool with rigorous security principles to protect developer source code, secrets, and credentials.

---

## 1. Local-First Isolation

- **Zero Remote Source Uploads**: Registered project source code, file structures, and uncommitted edits never leave the developer's computer.
- **Dedicated Independent Database**: MySQL 8.4 database `code_context_mcp` is completely separate from business and CRM databases.
- **Read-Only Target Codebases**: The RAG engine strictly scans and parses registered repositories. It never creates, edits, commits, or deletes files inside registered projects.
- **Per-Developer Isolation**: Each developer maintains their own local instances of MySQL, Qdrant, Ollama, and vector indexes.

---

## 2. API Key Protection & Cryptography

AI model provider API keys (OpenAI, Gemini, Anthropic) are sensitive credentials. The system guarantees they are never stored or exposed in plaintext:

### AES-256-GCM Encryption Architecture

```
User API Key (Plaintext)
         │
         ▼
[PBKDF2 / SHA-256 Key Derivation from ENCRYPTION_KEY]
         │
         ▼
[Generate random 96-bit (12-byte) IV]
         │
         ▼
[AES-256-GCM Cipher Encryption] ───► Generates 128-bit Auth Tag
         │
         ▼
Stored in MySQL (`ai_providers.api_key_encrypted`):
`<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`
```

### Protection Guarantees:
1. **At Rest**: Only the encrypted ciphertext with initialization vector and authentication tag is written to MySQL table `ai_providers`.
2. **In Transit / UI**: All API endpoints (`GET /api/ai/providers`) sanitize keys and only return masked representations (e.g. `sk-proj••••••••cdef`).
3. **Decryption on Demand**: Plaintext keys are decrypted strictly in memory at the exact moment a network request is dispatched to the AI provider endpoint.
4. **Key Rotation**: When updating a provider, leaving the API key input blank preserves the existing encrypted key without re-encrypting or exposing it.

---

## 3. Secret Exclusion & .gitignore Compliance

During indexing, the scanner automatically ignores sensitive files to prevent credentials from entering vector collections or MySQL chunks:

- **Environment Files**: `.env`, `.env.*`, `.env.local`, `.env.production` are strictly blocked.
- **Credentials & Keys**: `*.pem`, `*.key`, `*.cert`, `id_rsa`, `*.keystore`.
- **Version Control & Dependencies**: `.git/`, `node_modules/`, `vendor/`, `dist/`, `build/`, `storage/framework/`.
- **Project `.gitignore`**: The indexer parses and adheres to the project's own `.gitignore` rules.

---

## 4. Local Authentication & Session Security

The Local Admin Dashboard is protected by a local authentication layer:

- **Password Storage**: Passwords are never stored in plaintext. They are salted with a 16-byte cryptographically secure salt and hashed using **PBKDF2 with HMAC-SHA-512** over 100,000 iterations.
- **Timing-Safe Verification**: Passwords are authenticated using `crypto.timingSafeEqual` to eliminate timing attack vectors.
- **Cryptographic Session Tokens**: Active sessions generate a 64-character hexadecimal random token (`crypto.randomBytes(32)`).
- **Session Transport**: Tokens can be sent via `Authorization: Bearer <token>` header or via `HttpOnly`, `SameSite: Lax` session cookie (`code_context_session`).
- **Protected Endpoints**: All `/api/*` routes (except the login challenge `/api/auth/login`) require a valid, non-expired session.

