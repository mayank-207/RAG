import { PhpParser } from './php.js';
import { JavaScriptParser } from './javascript.js';
import { SqlParser } from './sql.js';
import { MarkdownParser } from './markdown.js';
import { ParsedFileResult } from './types.js';

export * from './types.js';

export class CodeParser {
  public static parse(content: string, relativePath: string, language: string): ParsedFileResult {
    switch (language.toLowerCase()) {
      case 'php':
        return PhpParser.parse(content, relativePath);
      case 'javascript':
      case 'typescript':
      case 'jsx':
      case 'tsx':
        return JavaScriptParser.parse(content, relativePath);
      case 'sql':
        return SqlParser.parse(content, relativePath);
      case 'markdown':
        return MarkdownParser.parse(content, relativePath);
      default: {
        const lines = content.split('\n');
        return {
          symbols: [],
          dependencies: [],
          routes: [],
          tables: [],
          memories: [],
          rawChunks: [
            {
              symbolName: undefined,
              symbolType: 'text_file',
              startLine: 1,
              endLine: lines.length,
              content: content.trim(),
            },
          ],
        };
      }
    }
  }
}

