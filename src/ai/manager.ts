import mysql from 'mysql2/promise';
import { query, withTransaction } from '../db/connection.js';
import { encryptApiKey, decryptApiKey, maskApiKey } from '../security/crypto.js';
import {
  AIProviderInterface,
  ProviderConfig,
  ProviderType,
  ConnectionTestResult,
  ProviderModel,
  TaskType,
  GenerationResult,
} from './types.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { OpenAICompatibleProvider } from './providers/openai-compatible.js';
import { logger } from '../utils/logger.js';

export interface AIProviderRecord {
  id: string;
  name: string;
  provider_type: ProviderType;
  api_key_masked: string | null;
  base_url: string | null;
  api_version: string | null;
  is_enabled: number;
  default_model: string | null;
  config: any;
  created_at: string;
  updated_at: string;
}

export interface ModelAssignmentRecord {
  task_type: TaskType;
  provider_id: string;
  model_name: string;
  updated_at: string;
}

export interface EmbeddingSettingsRecord {
  id: number;
  provider: string;
  model_name: string;
  dimensions: number;
  batch_size: number;
  is_synced: number;
  updated_at: string;
}

export class AIModelManager {
  /**
   * Instantiates the provider class for a given config.
   */
  public createProviderInstance(cfg: ProviderConfig): AIProviderInterface {
    switch (cfg.providerType) {
      case 'ollama':
        return new OllamaProvider(cfg);
      case 'openai':
        return new OpenAIProvider(cfg);
      case 'gemini':
        return new GeminiProvider(cfg);
      case 'anthropic':
        return new AnthropicProvider(cfg);
      case 'openai_compatible':
        return new OpenAICompatibleProvider(cfg);
      default:
        return new OpenAICompatibleProvider(cfg);
    }
  }

  /**
   * Lists all configured AI providers with masked API keys.
   */
  public async listProviders(): Promise<any[]> {
    const rows = await query<mysql.RowDataPacket[]>(
      'SELECT id, name, provider_type, provider_type as type, api_key_masked, api_key_masked as masked_api_key, base_url, api_version, is_enabled, default_model, config, created_at, updated_at FROM ai_providers ORDER BY created_at ASC'
    );
    return rows;
  }

  /**
   * Gets a specific provider configuration, optionally including the decrypted API key for execution.
   */
  public async getProviderConfig(id: string, includeDecryptedKey: boolean = false): Promise<ProviderConfig | null> {
    const rows = await query<mysql.RowDataPacket[]>(
      'SELECT * FROM ai_providers WHERE id = ? LIMIT 1',
      [id]
    );

    if (!rows || rows.length === 0) return null;
    const r = rows[0] as any;

    let apiKey: string | undefined = undefined;
    if (includeDecryptedKey && r.api_key_encrypted) {
      try {
        apiKey = decryptApiKey(r.api_key_encrypted);
      } catch (err) {
        logger.error({ err, providerId: id }, 'Failed to decrypt API key');
      }
    }

    return {
      id: r.id,
      name: r.name,
      providerType: r.provider_type,
      apiKey,
      baseUrl: r.base_url || undefined,
      apiVersion: r.api_version || undefined,
      isEnabled: Boolean(r.is_enabled),
      defaultModel: r.default_model || undefined,
      config: typeof r.config === 'string' ? JSON.parse(r.config) : r.config,
    };
  }

  /**
   * Saves or updates an AI provider configuration.
   * Encrypts the API key if provided.
   */
  public async saveProvider(data: {
    id?: string;
    name: string;
    providerType?: ProviderType;
    type?: ProviderType;
    apiKey?: string;
    baseUrl?: string;
    apiVersion?: string;
    isEnabled?: boolean;
    defaultModel?: string;
    config?: any;
  }): Promise<any> {
    const providerType = (data.providerType || data.type || 'openai') as ProviderType;
    const baseSlug = (data.name || providerType).toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 32);
    const id = (data.id && data.id.trim())
      ? data.id.trim()
      : `${baseSlug}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    const existing = await this.getProviderConfig(id, true);

    let encryptedKey: string | null = null;
    let maskedKey: string | null = null;

    if (data.apiKey && data.apiKey.trim()) {
      const enc = encryptApiKey(data.apiKey.trim());
      encryptedKey = enc.encrypted;
      maskedKey = enc.masked;
    } else if (existing && existing.apiKey) {
      // Retain existing key if none provided
      const enc = encryptApiKey(existing.apiKey);
      encryptedKey = enc.encrypted;
      maskedKey = enc.masked;
    }

    if (providerType !== 'ollama' && !encryptedKey) {
      throw new Error(`API key is required for ${providerType}`);
    }

    let baseUrl = data.baseUrl?.trim() || null;
    if (baseUrl && (providerType === 'gemini' || providerType === 'openai' || providerType === 'anthropic')) {
      if (baseUrl.includes(':11434')) {
        baseUrl = null;
      }
    }

    let defaultModel = data.defaultModel?.trim() || null;
    if (providerType === 'gemini') {
      if (!defaultModel || defaultModel.toLowerCase().includes('gpt') || defaultModel.includes('nomic')) {
        defaultModel = 'gemini-2.0-flash';
      }
    } else if (providerType === 'openai') {
      if (!defaultModel || defaultModel.toLowerCase().includes('gemini') || defaultModel.includes('nomic')) {
        defaultModel = 'gpt-4o-mini';
      }
    }

    const isEnabled = data.isEnabled !== undefined ? (data.isEnabled ? 1 : 0) : 1;

    await query(
      `INSERT INTO ai_providers
        (id, name, provider_type, api_key_encrypted, api_key_masked, base_url, api_version, is_enabled, default_model, config)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         provider_type = VALUES(provider_type),
         api_key_encrypted = COALESCE(VALUES(api_key_encrypted), api_key_encrypted),
         api_key_masked = COALESCE(VALUES(api_key_masked), api_key_masked),
         base_url = VALUES(base_url),
         api_version = VALUES(api_version),
         is_enabled = VALUES(is_enabled),
         default_model = VALUES(default_model),
         config = VALUES(config)`,
      [
        id,
        data.name || id,
        providerType,
        encryptedKey,
        maskedKey,
        baseUrl,
        data.apiVersion || null,
        isEnabled,
        defaultModel,
        data.config ? JSON.stringify(data.config) : null,
      ]
    );

    const updated = await query<mysql.RowDataPacket[]>(
      'SELECT id, name, provider_type, provider_type as type, api_key_masked, api_key_masked as masked_api_key, base_url, is_enabled, default_model, config, created_at, updated_at FROM ai_providers WHERE id = ?',
      [id]
    );
    return updated[0];
  }

  /**
   * Deletes a provider configuration.
   */
  public async deleteProvider(id: string): Promise<void> {
    if (id === 'ollama') {
      throw new Error('Default Ollama provider cannot be deleted');
    }
    await query('DELETE FROM ai_providers WHERE id = ?', [id]);
  }

  /**
   * Tests connection to a provider using provided or saved credentials.
   */
  public async testProviderConnection(id: string, testConfig?: Partial<ProviderConfig>): Promise<ConnectionTestResult> {
    const existing = (id && id.trim()) ? await this.getProviderConfig(id.trim(), true) : null;

    const providerType = (testConfig?.providerType || (testConfig as any)?.type || existing?.providerType || 'gemini') as ProviderType;

    let baseUrl = (testConfig?.baseUrl !== undefined ? testConfig.baseUrl : existing?.baseUrl)?.trim() || undefined;
    if (baseUrl && (providerType === 'gemini' || providerType === 'openai' || providerType === 'anthropic')) {
      if (baseUrl.includes(':11434')) {
        baseUrl = undefined;
      }
    }

    let defaultModel = (testConfig?.defaultModel !== undefined ? testConfig.defaultModel : existing?.defaultModel)?.trim() || undefined;
    if (providerType === 'gemini') {
      if (!defaultModel || defaultModel.toLowerCase().includes('gpt') || defaultModel.includes('nomic')) {
        defaultModel = 'gemini-2.0-flash';
      }
    }

    const mergedConfig: ProviderConfig = {
      id: id || 'test_provider',
      name: testConfig?.name || existing?.name || id || 'Test Provider',
      providerType,
      apiKey: testConfig?.apiKey !== undefined ? testConfig.apiKey : existing?.apiKey,
      baseUrl,
      apiVersion: testConfig?.apiVersion !== undefined ? testConfig.apiVersion : existing?.apiVersion,
      isEnabled: true,
      defaultModel,
    };

    const instance = this.createProviderInstance(mergedConfig);
    const validation = instance.validateConfig(mergedConfig);
    if (!validation.valid) {
      return {
        ok: false,
        message: validation.errors.join(', '),
        error: 'VALIDATION_FAILED',
      };
    }

    return await instance.testConnection(mergedConfig);
  }

  /**
   * Fetches models available for a provider.
   */
  public async listProviderModels(id: string): Promise<ProviderModel[]> {
    const cfg = await this.getProviderConfig(id, true);
    if (!cfg) return [];

    const instance = this.createProviderInstance(cfg);
    return await instance.listModels(cfg);
  }

  /**
   * Gets task-specific model assignments.
   */
  public async getModelAssignments(): Promise<ModelAssignmentRecord[]> {
    const rows = await query<mysql.RowDataPacket[]>('SELECT * FROM ai_model_assignments');
    return rows as ModelAssignmentRecord[];
  }

  /**
   * Sets task-specific model assignment.
   */
  public async setModelAssignment(taskType: TaskType, providerId: string, modelName: string): Promise<void> {
    await query(
      `INSERT INTO ai_model_assignments (task_type, provider_id, model_name)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider_id = VALUES(provider_id),
         model_name = VALUES(model_name),
         updated_at = NOW()`,
      [taskType, providerId, modelName]
    );
  }

  /**
   * Gets embedding settings.
   */
  public async getEmbeddingSettings(): Promise<EmbeddingSettingsRecord> {
    const rows = await query<mysql.RowDataPacket[]>('SELECT * FROM embedding_settings WHERE id = 1 LIMIT 1');
    if (rows && rows.length > 0) {
      return rows[0] as EmbeddingSettingsRecord;
    }
    return {
      id: 1,
      provider: 'ollama',
      model_name: 'nomic-embed-text',
      dimensions: 768,
      batch_size: 32,
      is_synced: 1,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Updates embedding settings, checking for vector dimension compatibility.
   */
  public async updateEmbeddingSettings(updates: {
    provider?: string;
    modelName?: string;
    dimensions?: number;
    batchSize?: number;
  }): Promise<{ settings: EmbeddingSettingsRecord; requiresReindex: boolean }> {
    const current = await this.getEmbeddingSettings();

    const provider = updates.provider || current.provider;
    const modelName = updates.modelName || current.model_name;
    const dimensions = updates.dimensions !== undefined ? updates.dimensions : current.dimensions;
    const batchSize = updates.batchSize !== undefined ? updates.batchSize : current.batch_size;

    // Detect if vector dimensions or model changed
    const requiresReindex = modelName !== current.model_name || dimensions !== current.dimensions;
    const isSynced = requiresReindex ? 0 : 1;

    await query(
      `INSERT INTO embedding_settings (id, provider, model_name, dimensions, batch_size, is_synced)
       VALUES (1, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         provider = VALUES(provider),
         model_name = VALUES(model_name),
         dimensions = VALUES(dimensions),
         batch_size = VALUES(batch_size),
         is_synced = VALUES(is_synced),
         updated_at = NOW()`,
      [provider, modelName, dimensions, batchSize, isSynced]
    );

    const updated = await this.getEmbeddingSettings();
    return { settings: updated, requiresReindex };
  }

  /**
   * Generates a completion for a specific task using assigned provider and model.
   */
  public async generateForTask(taskType: TaskType, prompt: string, systemPrompt?: string): Promise<GenerationResult> {
    // 1. Look up task assignment
    const assignments = await query<mysql.RowDataPacket[]>(
      'SELECT * FROM ai_model_assignments WHERE task_type = ? LIMIT 1',
      [taskType]
    );

    let providerId = 'ollama';
    let modelName: string | undefined = undefined;

    if (assignments && assignments.length > 0) {
      providerId = assignments[0].provider_id;
      modelName = assignments[0].model_name;
    }

    const cfg = await this.getProviderConfig(providerId, true);
    if (!cfg || !cfg.isEnabled) {
      // Fallback to Ollama if configured provider is disabled
      const ollamaCfg = await this.getProviderConfig('ollama', true);
      const instance = new OllamaProvider(ollamaCfg || { id: 'ollama', name: 'Ollama', providerType: 'ollama', isEnabled: true });
      return await instance.generateResponse(prompt, { systemPrompt, model: 'llama3.2' });
    }

    const instance = this.createProviderInstance(cfg);
    return await instance.generateResponse(prompt, { systemPrompt, model: modelName || cfg.defaultModel });
  }
}

export const aiManager = new AIModelManager();
