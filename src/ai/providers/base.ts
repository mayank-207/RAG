import { AIProviderInterface, ProviderType, ProviderConfig, ConnectionTestResult, ProviderModel, GenerationResult } from '../types.js';

export abstract class BaseAIProvider implements AIProviderInterface {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly type: ProviderType;

  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  public abstract validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] };
  public abstract testConnection(config: ProviderConfig): Promise<ConnectionTestResult>;
  public abstract listModels(config: ProviderConfig): Promise<ProviderModel[]>;
  public abstract generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult>;

  protected async fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 15000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeout);
    }
  }
}

