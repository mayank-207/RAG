import { BaseAIProvider } from './base.js';
import { ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult, ProviderType } from '../types.js';

export class GeminiProvider extends BaseAIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';
  public readonly type: ProviderType = 'gemini';

  public validateConfig(cfg: ProviderConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      errors.push('Gemini API key is required');
    }
    return { valid: errors.length === 0, errors };
  }

  private getNormalizedBaseUrl(url?: string): string {
    const raw = (url || '').trim();
    if (!raw || raw.includes(':11434')) {
      return 'https://generativelanguage.googleapis.com/v1beta';
    }
    return raw.replace(/\/+$/, '');
  }

  public async testConnection(cfg: ProviderConfig): Promise<ConnectionTestResult> {
    const start = Date.now();
    const baseUrl = this.getNormalizedBaseUrl(cfg.baseUrl);

    if (!cfg.apiKey) {
      return { ok: false, message: 'Gemini API key is missing', latencyMs: 0, error: 'NO_API_KEY' };
    }

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'GET',
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
          message: `Gemini API error: ${errDetail}`,
          latencyMs,
          error: `HTTP ${res.status}: ${errDetail}`,
        };
      }

      const data = await res.json() as { models?: Array<{ name: string; displayName?: string }> };
      const models = (data.models || [])
        .map((m) => m.name.replace('models/', ''))
        .filter((name) => name.includes('gemini'));

      const modelTested = cfg.defaultModel && cfg.defaultModel.includes('gemini')
        ? cfg.defaultModel
        : (models[0] || 'gemini-2.0-flash');

      return {
        ok: true,
        message: `Successfully connected to Google Gemini (${models.length} model(s) available)`,
        modelsFound: models.slice(0, 8),
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: `Failed to connect to Google Gemini: ${err?.message || String(err)}`,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  public async listModels(cfg: ProviderConfig): Promise<ProviderModel[]> {
    const baseUrl = this.getNormalizedBaseUrl(cfg.baseUrl);
    if (!cfg.apiKey) return this.getDefaultModels();

    try {
      const res = await this.fetchWithTimeout(`${baseUrl}/models?key=${encodeURIComponent(cfg.apiKey)}`, {
        method: 'GET',
      });
      if (!res.ok) return this.getDefaultModels();

      const data = await res.json() as { models?: Array<{ name: string; displayName?: string; description?: string }> };
      const models = (data.models || [])
        .filter((m) => m.name.includes('gemini'))
        .map((m) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          description: m.description || 'Google Gemini model',
        }));

      return models.length > 0 ? models : this.getDefaultModels();
    } catch {
      return this.getDefaultModels();
    }
  }

  private getDefaultModels(): ProviderModel[] {
    return [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Next-gen multimodal, fast and intelligent' },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'Deep reasoning, 2M context window' },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast, cost-effective multimodal model' },
    ];
  }

  public async generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult> {
    const baseUrl = this.getNormalizedBaseUrl(this.config.baseUrl);
    let model = options?.model || this.config.defaultModel || 'gemini-2.0-flash';
    if (!model.toLowerCase().includes('gemini')) {
      model = 'gemini-2.0-flash';
    }

    const body: any = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    };

    if (options?.systemPrompt) {
      body.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    const res = await this.fetchWithTimeout(
      `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(this.config.apiKey || '')}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini request failed (HTTP ${res.status}): ${errBody}`);
    }

    const data = await res.json() as any;
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text || '';

    return {
      text,
      model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : undefined,
    };
  }
}

