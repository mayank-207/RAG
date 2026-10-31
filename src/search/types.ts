export interface SearchHit {
  chunkId: string;
  projectId: string;
  workspaceId: string;
  relativePath: string;
  symbolName: string | null;
  symbolType: string;
  startLine: number;
  endLine: number;
  content: string;
  language: string;
  score: number;
  channel: 'exact' | 'fulltext' | 'vector' | 'memory' | 'path';
  explanation?: string;
}

export interface HybridSearchQuery {
  projectId: string;
  workspaceId?: string;
  query: string;
  symbolType?: string;
  pathFilter?: string;
  limit?: number;
}

export interface CuratedMemoryHit {
  category: string;
  topic: string;
  ruleStatement: string;
  status: string;
  sourceFile: string | null;
  score: number;
}
