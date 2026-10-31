import path from 'node:path';
import { RawChunk } from '../parsers/types.js';
import { sha256, generateChunkId } from '../utils/hash.js';

export interface CodeChunk {
  chunkId: string;
  projectId: string;
  workspaceId: string;
  relativePath: string;
  fileExtension: string;
  symbolName: string | null;
  symbolType: string;
  parentSymbol: string | null;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  language: string;
}

const MAX_CHUNK_CHARS = 4000; // ~1000 tokens

export class CodeChunker {
  /**
   * Transforms raw AST/parser chunks into normalized, bounded chunks.
   */
  public static processChunks(
    rawChunks: RawChunk[],
    projectId: string,
    workspaceId: string,
    relativePath: string,
    language: string
  ): CodeChunk[] {
    const ext = path.extname(relativePath);
    const finalChunks: CodeChunk[] = [];

    for (const raw of rawChunks) {
      if (!raw.content || !raw.content.trim()) continue;

      if (raw.content.length <= MAX_CHUNK_CHARS) {
        const hash = sha256(raw.content);
        const chunkId = generateChunkId(projectId, relativePath, raw.startLine, raw.endLine, raw.content);

        finalChunks.push({
          chunkId,
          projectId,
          workspaceId,
          relativePath,
          fileExtension: ext,
          symbolName: raw.symbolName || null,
          symbolType: raw.symbolType,
          parentSymbol: raw.parentSymbol || null,
          startLine: raw.startLine,
          endLine: raw.endLine,
          content: raw.content,
          contentHash: hash,
          language,
        });
      } else {
        // Large block: perform bounded chunking preserving line numbers
        const splitChunks = this.splitLargeChunk(raw, projectId, workspaceId, relativePath, language, ext);
        finalChunks.push(...splitChunks);
      }
    }

    return finalChunks;
  }

  private static splitLargeChunk(
    raw: RawChunk,
    projectId: string,
    workspaceId: string,
    relativePath: string,
    language: string,
    fileExtension: string
  ): CodeChunk[] {
    const lines = raw.content.split('\n');
    const result: CodeChunk[] = [];
    const linesPerSubChunk = 80;

    for (let i = 0; i < lines.length; i += linesPerSubChunk) {
      const slice = lines.slice(i, i + linesPerSubChunk);
      const subContent = slice.join('\n');
      const startLine = raw.startLine + i;
      const endLine = Math.min(raw.endLine, startLine + slice.length - 1);
      const hash = sha256(subContent);
      const chunkId = generateChunkId(projectId, relativePath, startLine, endLine, subContent);

      result.push({
        chunkId,
        projectId,
        workspaceId,
        relativePath,
        fileExtension,
        symbolName: raw.symbolName ? `${raw.symbolName} (part ${Math.floor(i / linesPerSubChunk) + 1})` : null,
        symbolType: raw.symbolType,
        parentSymbol: raw.parentSymbol || null,
        startLine,
        endLine,
        content: subContent,
        contentHash: hash,
        language,
      });
    }

    return result;
  }
}
