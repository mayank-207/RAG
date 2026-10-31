import { BaseAIProvider } from './base.js';
import { ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult, ProviderType } from '../types.js';

export class OllamaProvider extends BaseAIProvider {
  public readonly id = 'ollama';
  public readonly name = 'Local Ollama';
  public readonly type: ProviderType = 'ollama';

  public validateConfig(cfg: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.baseUrl || !cfg.baseUrl.trim()) {
      errors.push('Base URL is required for Ollama (e.g. http://127.0.0.1:11434)');
    }
    return { valid: errors.length === 0, errors };
  }

  public async testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const baseUrl = (cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/api/tags`, { method: 'GET' }, 5000);
      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          ok: false,
          message: `Ollama returned HTTP ${res.status}: ${res.statusText}`,
          latencyMs,
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json() as { models?: Array<{ name: string }> };
      const models = (data.models || []).map((m) => m.name);

      return {
        ok: true,
        message: `Successfully connected to Ollama (${models.length} model(s) available)`,
        modelsFound: models,
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: 'Could not connect to Ollama. Make sure Ollama daemon is running.',
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<ProviderModel[]> {
    const baseUrl = (cfg.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/api/tags`, { method: 'GET' });
      if (!res.ok) return [];
      const data = await res.json() as { models?: Array<{ name: string; details?: any }> };
      return (data.models || []).map((m) => ({
        id: m.name,
        name: m.name,
        description: `Ollama local model (${m.details?.parameter_size || 'local'})`,
      }));
    } catch {
      return [];
    }
  }

  public async generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult> {
    const baseUrl = (this.config.baseUrl || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = options?.model || this.config.defaultModel || 'llama3.2';

    const messages: any[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await this.fetchWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
      }),
    }, 60000);

    if (!res.ok) {
      throw new Error(`Ollama chat failed: HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json() as any;
    return {
      text: data.message?.content || '',
      model,
      usage: {
        promptTokens: data.prompt_eval_count,
        completionTokens: data.eval_count,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
    };
  }
}

