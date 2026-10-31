# AI Model & Provider Configuration Guide

`code-context-mcp` features a multi-provider AI architecture supporting cloud and local providers, with strict isolation between **chat/generation models** and **vector embedding models**.

---

## 1. Supported AI Providers

The system supports five distinct provider types:

| Provider | Type Key | Default Base URL | Default Model | Authentication |
|---|---|---|---|---|
| **OpenAI** | `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` | `sk-...` API Key |
| **Google Gemini** | `gemini` | `https://generativelanguage.googleapis.com` | `gemini-1.5-flash` | `AIza...` API Key |
| **Anthropic** | `anthropic` | `https://api.anthropic.com` | `claude-3-5-haiku-latest` | `sk-ant-...` API Key |
| **Local Ollama** | `ollama` | `http://127.0.0.1:11434` | `llama3.2` | None required |
| **OpenAI Compatible** | `openai_compatible` | Custom URL (e.g. vLLM, LM Studio) | User specified | Optional Bearer token |

---

## 2. API Key Security (AES-256-GCM)

All API keys submitted through the Admin Dashboard or configuration API are protected by encryption at rest:

1. **Derived Master Key**: Derived from the developer's local `ENCRYPTION_KEY` in `.env` using SHA-256.
2. **AES-256-GCM Authenticated Encryption**:
   - Each key is encrypted using a unique 96-bit (12-byte) initialization vector (IV).
   - Generates an authentication tag ensuring ciphertext integrity and tampering detection.
   - Encrypted format: `<iv_hex>:<auth_tag_hex>:<ciphertext_hex>`.
3. **Key Masking**:
   - Plaintext keys are never stored in MySQL.
   - When retrieving provider lists, keys are masked (`sk-proj••••••••cdef`).
   - Plaintext keys are only decrypted in memory at the exact moment an outbound request is sent to the provider.

---

## 3. Strict Separation of Embeddings vs Generation

To prevent data corruption and collection mismatches, vector embeddings and generative chat models are decoupled:

### Vector Embeddings (Qdrant + Ollama)
- Handled exclusively by local **Ollama** running `nomic-embed-text` (or `all-minilm`).
- Produces dense mathematical vectors of fixed dimension (e.g. 768 dimensions).
- Changing generative models (e.g. switching between GPT-4o and Claude) **never** triggers or requires vector re-indexing.
- Managed independently in **Dashboard -> Embedding Settings**.

### Chat & Code Analysis (Configurable Providers)
- Handles prompt construction, AST analysis, relevance re-ranking, and response synthesis.
- Can use any enabled cloud provider (OpenAI, Gemini, Claude) or local Ollama LLMs.
- Managed independently in **Dashboard -> AI Model Providers**.

---

## 4. Task-Specific Model Assignments

Different software engineering tasks have different speed, context window, and reasoning requirements. The dashboard allows assigning specific models to specific tasks:

| Task Identifier | Purpose | Recommended Model |
|---|---|---|
| `code_analysis` | AST structure analysis and code relationship detection | Fast / Lightweight (`gpt-4o-mini`, `gemini-1.5-flash`) |
| `context_ranking` | Scoring relevance of retrieved chunks for prompt injection | High-speed model (`gpt-4o-mini`, `claude-3-5-haiku`) |
| `query_reformulation` | Expanding user questions into code-friendly search queries | Balanced model (`gpt-4o-mini`) |
| `architectural_reasoning` | Multi-file impact analysis and dependency synthesis | High-reasoning model (`gpt-4o`, `claude-3-5-sonnet`) |

### Configuring via Dashboard
1. Open **AI Model Providers** (`#ai-models`).
2. Add your provider (e.g. OpenAI with your API key). Click **Test Connection** to confirm connectivity.
3. Scroll down to **Task-Specific Model Assignments**.
4. Select the provider and optional model override for each task.
5. Click **Save Model Assignments**.

---

## 5. Testing Connections

Before saving or deploying a provider, you can verify connection status and latency:

```bash
# Example via REST API
curl -X POST http://127.0.0.1:3000/api/ai/providers/test \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "gemini",
    "apiKey": "AIzaSy...",
    "defaultModel": "gemini-1.5-flash"
  }'
```

Response:
```json
{
  "ok": true,
  "message": "Connection verified successfully",
  "latencyMs": 284,
  "modelTested": "gemini-1.5-flash"
}
```

