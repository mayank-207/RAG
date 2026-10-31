import { BaseAIProvider } from './base.js';
import { ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult, ProviderType } from '../types.js';

export class OpenAIProvider extends BaseAIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI';
  public readonly type: ProviderType = 'openai';

  public validateConfig(cfg: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      errors.push('OpenAI API key is required');
    }
    return { valid: errors.length === 0, errors };
  }

  public async testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');

    if (!cfg.apiKey) {
      return { ok: false, message: 'API key is missing', latencyMs: 0, error: 'NO_API_KEY' };
    }

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
        },
      }, 10000);

      const latencyMs = Date.now() - start;

      if (!res.ok) {
        let errDetail = res.statusText;
        try {
          const errBody = await res.json() as any;
          errDetail = errBody.error?.message || errDetail;
        } catch {}
        return {
          ok: false,
          message: `OpenAI authentication error: ${errDetail}`,
          latencyMs,
          error: `HTTP ${res.status}: ${errDetail}`,
        };
      }

      const data = await res.json() as { data?: Array<{ id: string }> };
      const models = (data.data || [])
        .map((m) => m.id)
        .filter((id) => id.includes('gpt') || id.includes('o1') || id.includes('o3'));

      return {
        ok: true,
        message: `Successfully connected to OpenAI (${models.length} relevant chat models available)`,
        modelsFound: models.slice(0, 10),
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Failed to connect to OpenAI: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<ProviderModel[]> {
    const baseUrl = (cfg.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    if (!cfg.apiKey) return this.getDefaultModels();

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
      });
      if (!res.ok) return this.getDefaultModels();

      const data = await res.json() as { data?: Array<{ id: string }> };
      const apiModels = (data.data || [])
        .map((m) => m.id)
        .filter((id) => id.includes('gpt') || id.includes('o1') || id.includes('o3'))
        .sort()
        .map((id) => ({
          id,
          name: id,
          description: `OpenAI ${id}`,
        }));

      return apiModels.length > 0 ? apiModels : this.getDefaultModels();
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ProviderModel[] {
    return [
      { id: 'gpt-4o', name: 'GPT-4o', description: 'Flagship high-intelligence multimodal model' },
      { id: 'gpt-4o-mini', name: 'GPT-4o-mini', description: 'Fast, cost-efficient small model' },
      { id: 'o3-mini', name: 'o3-mini', description: 'High-speed reasoning model' },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Previous high-capability model' },
    ];
  }

  public async generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult> {
    const baseUrl = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = options?.model || this.config.defaultModel || 'gpt-4o-mini';

    const messages: any[] = [];
    if (options?.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const res = await this.fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenAI request failed (HTTP ${res.status}): ${errBody}`);
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

