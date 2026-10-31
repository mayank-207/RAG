import { BaseAIProvider } from './base.js';
import { ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult, ProviderType } from '../types.js';

export class OpenAICompatibleProvider extends BaseAIProvider {
  public readonly id: string;
  public readonly name: string;
  public readonly type: ProviderType = 'openai_compatible';

  constructor(config: ProviderConfig) {
    super(config);
    this.id = config.id;
    this.name = config.name || 'OpenAI Compatible';
  }

  public validateConfig(cfg: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.baseUrl || !cfg.baseUrl.trim()) {
      errors.push('Base URL is required for custom OpenAI-compatible endpoint');
    }
    return { valid: errors.length === 0, errors };
  }

  public async testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');

    try {
      const headers: Record<string, string> = {};
      if (cfg.apiKey) {
        headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      }

      const res = await this.fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers,
      }, 10000);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        return {
          ok: false,
          message: `Endpoint returned HTTP ${res.status}: ${res.statusText}`,
          latencyMs,
          error: `HTTP ${res.status}`,
        };
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data || []).map((m) => m.id);

      return {
        ok: true,
        message: `Successfully connected to endpoint (${models.length} model(s) available)`,
        modelsFound: models.slice(0, 10),
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Connection failed: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<ProviderModel[]> {
    const baseUrl = (cfg.baseUrl || '').replace(/\/+$/, '');
    try {
      const headers: Record<string, string> = {};
      if (cfg.apiKey) {
        headers['Authorization'] = `Bearer ${cfg.apiKey}`;
      }

      const res = await this.fetchWithTimeout(`${baseUrl}/models`, { method: 'GET', headers });
      if (!res.ok) return [];

      const data = await res.json() as { data?: Array<{ id: string }> };
      return (data.data || []).map((m) => ({
        id: m.id,
        name: m.id,
      }));
    } catch {
      return [];
    }
  }

  public async generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult> {
    const baseUrl = (this.config.baseUrl || '').replace(/\/+$/, '');
    const model = options?.model || this.config.defaultModel || 'default';

    const messages: any[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    const res = await this.fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Request failed (HTTP ${res.status}): ${errBody}`);
    }

    const data = await res.json() as any;
    return {
      text: data.choices?.[0]?.message?.content || '',
      model: data.model || model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    };
  }
}

