import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class OllamaClient {
  private enabled: boolean;
  private baseUrl: string;
  private model: string;
  private dimensions: number;

  constructor() {
    this.enabled = config.ollama.enabled;
    this.baseUrl = config.ollama.url.replace(/\/+$/, '');
    this.model = config.ollama.model;
    this.dimensions = config.ollama.dimensions;
  }

  /**
   * Checks if Ollama daemon is reachable and inspects available models.
   */
  public async checkHealth(): Promise<{ ok: boolean; modelAvailable: boolean; availableModels: string[]; error?: string }> {
    if (!this.enabled) {
      return { ok: false, modelAvailable: false, availableModels: [], error: 'Disabled via OLLAMA_ENABLED=false' };
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(1000) });
      if (!res.ok) {
        return { ok: false, modelAvailable: false, availableModels: [], error: `HTTP ${res.status}: ${res.statusText}` };
      }
      const data = await res.json() as { models?: Array<{ name: string }> };
      const modelNames = (data.models || []).map((m) => m.name);
      const modelFound = modelNames.some((m) => m.includes(this.model) || this.model.includes(m));

      return {
        ok: true,
        modelAvailable: modelFound,
        availableModels: modelNames,
      };
    } catch (err: any) {
      return {
        ok: false,
        modelAvailable: false,
        availableModels: [],
        error: err?.message || String(err),
      };
    }
  }

  /**
   * Generates a single embedding vector for text.
   */
  public async getEmbedding(text: string): Promise<number[] | null> {
    const results = await this.getBatchEmbeddings([text]);
    return results[0] || null;
  }

  /**
   * Generates batch embeddings for an array of text snippets.
   */
  public async getBatchEmbeddings(texts: string[]): Promise<Array<number[] | null>> {
    if (!this.enabled || texts.length === 0) return texts.map(() => null);

    // Fast check: verify Ollama is actually reachable before firing requests
    const health = await this.checkHealth();
    if (!health.ok) {
      return texts.map(() => null);
    }

    // Attempt modern batch endpoint `/api/embed` first
    try {
      const res = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const data = await res.json() as { embeddings?: number[][] };
        if (data.embeddings && Array.isArray(data.embeddings)) {
          return data.embeddings;
        }
      }
    } catch {
      // Fallback to sequential/concurrent /api/embeddings below
    }

    // Fallback: request via `/api/embeddings` individually
    const results: Array<number[] | null> = [];
    for (const text of texts) {
      try {
        const res = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.model,
            prompt: text,
          }),
          signal: AbortSignal.timeout(3000),
        });

        if (res.ok) {
          const data = await res.json() as { embedding?: number[] };
          results.push(data.embedding || null);
        } else {
          results.push(null);
        }
      } catch (err) {
        results.push(null);
      }
    }

    return results;
  }

  public getModelName(): string {
    return this.model;
  }

  public getDimensions(): number {
    return this.dimensions;
  }
}

export const ollamaClient = new OllamaClient();

