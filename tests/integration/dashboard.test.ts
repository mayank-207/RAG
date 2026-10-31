import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  encryptApiKey,
  decryptApiKey,
  maskApiKey,
  hashPassword,
  verifyPassword,
  generateSessionToken,
} from '../../src/security/crypto.js';
import { AuthService } from '../../src/server/auth.js';
import { aiManager } from '../../src/ai/manager.js';
import { createServerApp } from '../../src/server/app.js';
import { testDbConnection, closeDbPool, query } from '../../src/db/connection.js';
import type { Server } from 'node:http';

describe('Admin Dashboard, Security & AI Provider Integration', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;

  beforeAll(async () => {
    const conn = await testDbConnection();
    if (!conn.ok) {
      console.warn('MySQL not reachable for dashboard tests:', conn.error);
    }

    // Ensure default admin exists
    await AuthService.ensureDefaultAdmin();

    // Start Express server on ephemeral port for API testing
    const app = createServerApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // Clean up test providers
    await aiManager.deleteProvider('test-openai-prov').catch(() => {});
    await closeDbPool();
  });

  describe('1. Cryptography & Key Security (AES-256-GCM & PBKDF2)', () => {
    it('encrypts and decrypts API keys correctly', () => {
      const originalKey = 'sk-proj-1234567890abcdefghijklmnopqrstuvwxyz';
      const result = encryptApiKey(originalKey);

      expect(result.encrypted).not.toBe(originalKey);
      expect(result.encrypted).toContain(':'); // IV:AuthTag:Ciphertext format

      const decrypted = decryptApiKey(result.encrypted);
      expect(decrypted).toBe(originalKey);
    });

    it('masks API keys securely for UI display', () => {
      expect(maskApiKey('sk-1234567890abcdef')).toBe('sk-1234••••••••cdef');
      expect(maskApiKey('shortkey')).toBe('••••ey');
      expect(maskApiKey('')).toBe('');
    });

    it('hashes passwords with salt and verifies PBKDF2 hashes correctly', () => {
      const password = 'mySecretAdminPassword123!';
      const { hash, salt } = hashPassword(password);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(verifyPassword(password, hash, salt)).toBe(true);
      expect(verifyPassword('wrongPassword', hash, salt)).toBe(false);
    });

    it('generates unique cryptographic session tokens', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();

      expect(token1).toHaveLength(64);
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });
  });

  describe('2. Authentication & Session Management', () => {
    it('authenticates valid admin credentials and creates a session', async () => {
      const loginRes = await AuthService.login('admin', 'admin123');
      expect(loginRes).not.toBeNull();
      expect(loginRes?.user.username).toBe('admin');
      expect(loginRes?.token).toBeDefined();

      adminToken = loginRes!.token;

      // Validate session token
      const user = await AuthService.validateSession(adminToken);
      expect(user).not.toBeNull();
      expect(user?.username).toBe('admin');
    });

    it('rejects invalid credentials', async () => {
      const loginRes = await AuthService.login('admin', 'invalid-pass-xyz');
      expect(loginRes).toBeNull();
    });

    it('rejects invalid or expired session tokens', async () => {
      const user = await AuthService.validateSession('non-existent-token-12345');
      expect(user).toBeNull();
    });
  });

  describe('3. AI Provider Management & Key Isolation', () => {
    it('creates an AI provider with AES-256 encrypted API key', async () => {
      const provider = await aiManager.saveProvider({
        id: 'test-openai-prov',
        name: 'Test OpenAI Suite',
        type: 'openai',
        apiKey: 'sk-test-secret-key-1234567890',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        isEnabled: true,
      });

      expect(provider.id).toBe('test-openai-prov');
      expect(provider.masked_api_key).toContain('••••');
      expect(provider.masked_api_key).not.toContain('test-secret-key');

      // Verify in raw MySQL that the plaintext key is NEVER stored
      const rawRows = await query<any[]>('SELECT api_key_encrypted FROM ai_providers WHERE id = ?', ['test-openai-prov']);
      expect(rawRows[0].api_key_encrypted).not.toBe('sk-test-secret-key-1234567890');
      expect(rawRows[0].api_key_encrypted).toContain(':');

      // Verify decryption recovers original key
      const decrypted = decryptApiKey(rawRows[0].api_key_encrypted);
      expect(decrypted).toBe('sk-test-secret-key-1234567890');
    });

    it('creates an AI provider with auto-generated id when id is omitted and sanitizes mistaken Ollama baseUrl for Gemini', async () => {
      const provider = await aiManager.saveProvider({
        name: 'Google Gemini Pro',
        type: 'gemini',
        apiKey: 'AIzaSyTest1234567890abcdef',
        baseUrl: 'http://127.0.0.1:11434', // simulated mistaken Ollama URL
        defaultModel: 'gpt latest', // simulated mismatched model name
        isEnabled: true,
      });

      expect(provider.id).toBeDefined();
      expect(provider.id.length).toBeGreaterThan(0);
      expect(provider.base_url).toBeNull(); // sanitized
      expect(provider.default_model).toBe('gemini-2.0-flash'); // corrected
      expect(provider.masked_api_key).toContain('••••');

      // Clean up
      await aiManager.deleteProvider(provider.id);
    });

    it('lists providers with masked keys and never exposes plaintext', async () => {
      const providers = await aiManager.listProviders();
      const testProv = providers.find((p) => p.id === 'test-openai-prov');

      expect(testProv).toBeDefined();
      expect(testProv?.masked_api_key).toBe('sk-test••••••••7890');
      expect((testProv as any).encrypted_api_key).toBeUndefined();
    });

    it('updates task model assignments', async () => {
      await aiManager.setModelAssignment('code_analysis', 'test-openai-prov', 'gpt-4o-mini');

      const assignments = await aiManager.getModelAssignments();
      const codeAnalysis = assignments.find((a) => a.task_type === 'code_analysis');

      expect(codeAnalysis?.provider_id).toBe('test-openai-prov');
      expect(codeAnalysis?.model_name).toBe('gpt-4o-mini');
    });

    it('manages separate embedding settings without modifying chat models', async () => {
      const current = await aiManager.getEmbeddingSettings();
      expect(current.provider).toBe('ollama');

      const updated = await aiManager.updateEmbeddingSettings({
        provider: 'ollama',
        modelName: 'nomic-embed-text',
        dimensions: 768,
        batchSize: 32,
      });

      expect(updated.settings.model_name).toBe('nomic-embed-text');
      expect(updated.settings.dimensions).toBe(768);
    });
  });

  describe('4. REST API Endpoint Security & Data Output', () => {
    it('blocks unauthenticated requests to protected /api/ endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`);
      expect(res.status).toBe(401);
    });

    it('allows access to /api/dashboard/stats with valid Bearer token', async () => {
      const res = await fetch(`${baseUrl}/api/dashboard/stats`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.summary).toBeDefined();
      expect(typeof data.summary.totalRegisteredProjects).toBe('number');
      expect(typeof data.summary.totalIndexedFiles).toBe('number');
      expect(typeof data.summary.totalCodeChunks).toBe('number');
      expect(data.services.mysql.status).toBe('connected');
    });

    it('serves /api/projects with enriched data', async () => {
      const res = await fetch(`${baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.projects)).toBe(true);
    });

    it('serves /api/system/settings diagnostics', async () => {
      const res = await fetch(`${baseUrl}/api/system/settings`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.mysql).toBeDefined();
      expect(data.qdrant).toBeDefined();
      expect(data.ollama).toBeDefined();
      expect(data.mcp.transport).toBe('stdio');
    });
  });
});
