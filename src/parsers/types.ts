export type SymbolKind =
  | 'class'
  | 'interface'
  | 'trait'
  | 'method'
  | 'function'
  | 'property'
  | 'component'
  | 'hook'
  | 'route'
  | 'model'
  | 'controller'
  | 'middleware'
  | 'service'
  | 'type'
  | 'doc_section';

export interface ParsedSymbol {
  name: string;
  kind: SymbolKind;
  namespaceOrModule?: string;
  parentSymbol?: string;
  startLine: number;
  endLine: number;
  signature?: string;
  docstring?: string;
  visibility?: 'public' | 'protected' | 'private' | 'export';
}

export interface ParsedDependency {
  targetModule: string;
  targetSymbol?: string;
  dependencyType: 'import' | 'extends' | 'implements' | 'uses_trait' | 'calls' | 'renders_component' | 'service_inject';
  lineNumber: number;
}

export interface ParsedRoute {
  httpMethod: string;
  uriPattern: string;
  routeName?: string;
  controller?: string;
  action?: string;
  middleware?: string[];
  lineNumber: number;
}

export interface ParsedSchemaColumn {
  columnName: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  foreignTable?: string;
  foreignColumn?: string;
}

export interface ParsedSchemaTable {
  tableName: string;
  modelClass?: string;
  migrationFile?: string;
  columns: ParsedSchemaColumn[];
}

export interface ParsedCuratedMemory {
  category: 'business_rule' | 'coding_standard' | 'architecture_decision' | 'known_gotcha';
  topic: string;
  ruleStatement: string;
  status: 'approved' | 'proposed' | 'deprecated';
}

export interface RawChunk {
  symbolName?: string;
  symbolType: string;
  parentSymbol?: string;
  startLine: number;
  endLine: number;
  content: string;
}

export interface ParsedFileResult {
  symbols: ParsedSymbol[];
  dependencies: ParsedDependency[];
  routes: ParsedRoute[];
  tables: ParsedSchemaTable[];
  memories: ParsedCuratedMemory[];
  rawChunks: RawChunk[];
}
