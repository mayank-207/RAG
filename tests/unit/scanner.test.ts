import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { FileScanner } from '../../src/indexer/scanner.js';
import { assertSafePath } from '../../src/utils/paths.js';
import { CodeChunker } from '../../src/indexer/chunker.js';
import { sha256 } from '../../src/utils/hash.js';

describe('FileScanner & Security Checks', () => {
  it('correctly flags sensitive and secret files', () => {
    expect(FileScanner.isSecret('.env')).toBe(true);
    expect(FileScanner.isSecret('.env.local')).toBe(true);
    expect(FileScanner.isSecret('.env.production')).toBe(true);
    expect(FileScanner.isSecret('certs/server.key')).toBe(true);
    expect(FileScanner.isSecret('keys/id_rsa')).toBe(true);
    expect(FileScanner.isSecret('keys/id_ed25519')).toBe(true);
    expect(FileScanner.isSecret('secrets.json')).toBe(true);

    // Non-secrets
    expect(FileScanner.isSecret('app/Models/User.php')).toBe(false);
    expect(FileScanner.isSecret('.env.example')).toBe(false);
    expect(FileScanner.isSecret('src/components/ProjectList.tsx')).toBe(false);
  });

  it('detects programming languages correctly from extensions', () => {
    expect(FileScanner.detectLanguage('.php')).toBe('php');
    expect(FileScanner.detectLanguage('.ts')).toBe('typescript');
    expect(FileScanner.detectLanguage('.tsx')).toBe('tsx');
    expect(FileScanner.detectLanguage('.jsx')).toBe('jsx');
    expect(FileScanner.detectLanguage('.js')).toBe('javascript');
    expect(FileScanner.detectLanguage('.sql')).toBe('sql');
    expect(FileScanner.detectLanguage('.md')).toBe('markdown');
  });

  it('prevents path traversal outside of project root', () => {
    const root = 'C:/laragon/www/RAG/fixtures';
    expect(() => assertSafePath(root, '../../windows/system32')).toThrow(/Security Violation/);
    expect(() => assertSafePath(root, '../other-project')).toThrow(/Security Violation/);
  });
});

describe('CodeChunker & Hash Integrity', () => {
  it('generates consistent deterministic hashes', () => {
    const text1 = 'function test() { return 1; }';
    const text2 = 'function test() { return 1; }';
    const text3 = 'function test() { return 2; }';

    expect(sha256(text1)).toBe(sha256(text2));
    expect(sha256(text1)).not.toBe(sha256(text3));
  });

  it('preserves line numbers and chunk metadata', () => {
    const rawChunks = [
      {
        symbolName: 'calculateTotal',
        symbolType: 'method',
        startLine: 10,
        endLine: 25,
        content: 'public function calculateTotal() {\n  return $this->items->sum();\n}',
      },
    ];

    const processed = CodeChunker.processChunks(rawChunks, 'crm', 'main', 'app/Services/OrderService.php', 'php');
    expect(processed).toHaveLength(1);
    expect(processed[0].startLine).toBe(10);
    expect(processed[0].endLine).toBe(25);
    expect(processed[0].symbolName).toBe('calculateTotal');
    expect(processed[0].chunkId).toBeDefined();
  });
});

