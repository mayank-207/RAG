import { BaseAIProvider } from './base.js';
import { ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult, ProviderType } from '../types.js';

export class AnthropicProvider extends BaseAIProvider {
  public readonly id = 'anthropic';
  public readonly name = 'Anthropic Claude';
  public readonly type: ProviderType = 'anthropic';

  public validateConfig(cfg: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      errors.push('Anthropic API key is required');
    }
    return { valid: errors.length === 0, errors };
  }

  public async testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const baseUrl = (cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');

    if (!cfg.apiKey) {
      return { ok: false, message: 'Anthropic API key is missing', latencyMs: 0, error: 'NO_API_KEY' };
    }

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': cfg.apiVersion || '2023-06-01',
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
          message: `Anthropic API error: ${errDetail}`,
          latencyMs,
          error: `HTTP ${res.status}: ${errDetail}`,
        };
      }

      const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> };
      const models = (data.data || []).map((m) => m.id);

      return {
        ok: true,
        message: `Successfully connected to Anthropic (${models.length} model(s) available)`,
        modelsFound: models.slice(0, 6),
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Failed to connect to Anthropic: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<ProviderModel[]> {
    const baseUrl = (cfg.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    if (!cfg.apiKey) return this.getDefaultModels();

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models`, {
        method: 'GET',
        headers: {
          'x-api-key': cfg.apiKey,
          'anthropic-version': cfg.apiVersion || '2023-06-01',
        },
      });

      if (!res.ok) return this.getDefaultModels();
      const data = await res.json() as { data?: Array<{ id: string; display_name?: string }> };
      const models = (data.data || []).map((m) => ({
        id: m.id,
        name: m.display_name || m.id,
        description: `Anthropic Claude model ${m.id}`,
      }));

      return models.length > 0 ? models : this.getDefaultModels();
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ProviderModel[] {
    return [
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', description: 'Most intelligent hybrid reasoning & coding model' },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', description: 'Industry benchmark for coding & analysis' },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fastest lightweight Claude model' },
    ];
  }

  public async generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult> {
    const baseUrl = (this.config.baseUrl || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
    const model = options?.model || this.config.defaultModel || 'claude-3-5-sonnet-20241022';

    const body: any = {
      model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    };

    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const res = await this.fetchWithTimeout(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey || '',
        'anthropic-version': this.config.apiVersion || '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Anthropic request failed (HTTP ${res.status}): ${errBody}`);
    }

    const data = await res.json() as any;
    const text = data.content?.[0]?.text || '';

    return {
      text,
      model,
      usage: data.usage ? {
        promptTokens: data.usage.input_tokens,
        completionTokens: data.usage.output_tokens,
        totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
      } : undefined,
    };
  }
}

