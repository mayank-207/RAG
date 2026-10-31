import fs from 'node:fs';
import path from 'node:path';
import ignore, { Ignore } from 'ignore';
import { sha256 } from '../utils/hash.js';
import { normalizePath, assertSafePath, toRelativePosixPath } from '../utils/paths.js';
import { logger } from '../utils/logger.js';

export interface ScannedFile {
  relativePath: string;
  absolutePath: string;
  fileExtension: string;
  language: string;
  contentHash: string;
  sizeBytes: number;
}

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  'vendor',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  'local-data',
  'storage/framework',
  'storage/logs',
  'storage/debugbar',
  '.idea',
  '.vscode',
]);

const SECRET_PATTERNS = [
  /^\.env($|\..+)/i,
  /\.(pem|key|pkcs12|pfx|p12|crt|cer|der|kdbx|keystore)$/i,
  /^id_(rsa|dsa|ed25519|ecdsa)($|\..*)/i,
  /credentials\.json$/i,
  /service-account.*\.json$/i,
  /secret/i,
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp', '.bmp', '.tiff',
  '.mp4', '.webm', '.ogg', '.mp3', '.wav', '.flac',
  '.zip', '.tar', '.gz', '.tgz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.sqlite', '.db', '.lock',
]);

const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 2; // 2MB limit

export class FileScanner {
  private rootPath: string;
  private ignoreFilter: Ignore;

  constructor(rootPath: string, customExclusions: string[] = []) {
    this.rootPath = path.resolve(rootPath);
    this.ignoreFilter = ignore();

    // Load .gitignore if present in root
    const gitignorePath = path.join(this.rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        this.ignoreFilter.add(gitignoreContent);
      } catch (err) {
        logger.warn({ err }, 'Failed to read .gitignore');
      }
    }

    // Add custom exclusions
    if (customExclusions.length > 0) {
      this.ignoreFilter.add(customExclusions);
    }
  }

  /**
   * Checks if a filename or path matches forbidden secret patterns.
   */
  public static isSecret(relativePath: string): boolean {
    const base = path.basename(relativePath);
    if (base.toLowerCase() === '.env.example' || base.toLowerCase().endsWith('.example')) {
      return false;
    }
    return SECRET_PATTERNS.some((pattern) => pattern.test(base) || pattern.test(relativePath));
  }

  /**
   * Detects programming language from file extension.
   */
  public static detectLanguage(ext: string): string {
    switch (ext.toLowerCase()) {
      case '.php':
        return 'php';
      case '.ts':
        return 'typescript';
      case '.tsx':
        return 'tsx';
      case '.js':
      case '.mjs':
      case '.cjs':
        return 'javascript';
      case '.jsx':
        return 'jsx';
      case '.json':
        return 'json';
      case '.sql':
        return 'sql';
      case '.md':
      case '.markdown':
        return 'markdown';
      case '.yaml':
      case '.yml':
        return 'yaml';
      case '.css':
      case '.scss':
      case '.less':
        return 'css';
      case '.html':
        return 'html';
      default:
        return 'text';
    }
  }

  /**
   * Recursively scans root directory and returns valid, safe source files.
   */
  public async scan(): Promise<ScannedFile[]> {
    const results: ScannedFile[] = [];
    await this.walk(this.rootPath, '', results);
    return results;
  }

  private async walk(currentDir: string, relativeDir: string, results: ScannedFile[]): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      logger.warn({ err, currentDir }, 'Failed to read directory');
      return;
    }

    for (const entry of entries) {
      const entryName = entry.name;
      const entryRelative = relativeDir ? `${relativeDir}/${entryName}` : entryName;
      const normalizedRelative = normalizePath(entryRelative);

      // Check directory exclusions
      if (entry.isDirectory()) {
        if (DEFAULT_IGNORED_DIRS.has(entryName) || this.ignoreFilter.ignores(normalizedRelative) || this.ignoreFilter.ignores(`${normalizedRelative}/`)) {
          continue;
        }

        const childPath = path.join(currentDir, entryName);
        assertSafePath(this.rootPath, childPath);
        await this.walk(childPath, normalizedRelative, results);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      // Check ignore filter
      if (this.ignoreFilter.ignores(normalizedRelative)) {
        continue;
      }

      // Check secret protection
      if (FileScanner.isSecret(normalizedRelative)) {
        logger.debug({ file: normalizedRelative }, 'Skipping secret or credential file');
        continue;
      }

      const ext = path.extname(entryName).toLowerCase();
      // Check binary extensions
      if (BINARY_EXTENSIONS.has(ext)) {
        continue;
      }

      const absolutePath = path.join(currentDir, entryName);
      assertSafePath(this.rootPath, absolutePath);

      let stats: fs.Stats;
      try {
        stats = fs.statSync(absolutePath);
      } catch {
        continue;
      }

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        logger.debug({ file: normalizedRelative, sizeBytes: stats.size }, 'Skipping file exceeding size limit');
        continue;
      }

      let content: Buffer;
      try {
        content = fs.readFileSync(absolutePath);
      } catch {
        continue;
      }

      const contentHash = sha256(content);
      const language = FileScanner.detectLanguage(ext);

      results.push({
        relativePath: normalizedRelative,
        absolutePath,
        fileExtension: ext,
        language,
        contentHash,
        sizeBytes: stats.size,
      });
    }
  }
}
