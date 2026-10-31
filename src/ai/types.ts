export type ProviderType = 'openai' | 'gemini' | 'anthropic' | 'ollama' | 'openai_compatible';

export type TaskType =
  | 'code_analysis'
  | 'task_context'
  | 'doc_summarization'
  | 'rag_response'
  | 'code_explanation';

export interface ProviderModel {
  id: string;
  name: string;
  contextWindow?: number;
  description?: string;
}

export interface ProviderConfig {
  id: string;
  name: string;
  providerType: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  apiVersion?: string;
  isEnabled: boolean;
  defaultModel?: string;
  config?: any;
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  modelsFound?: string[];
  latencyMs?: number;
  error?: string;
}

export interface GenerationResult {
  text: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProviderInterface {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;

  validateConfig(config: ProviderConfig): { valid: boolean; errors: string[] };
  testConnection(config: ProviderConfig): Promise<ConnectionTestResult>;
  listModels(config: ProviderConfig): Promise<ProviderModel[]>;
  generateResponse(prompt: string, options?: { systemPrompt?: string; model?: string }): Promise<GenerationResult>;
}

