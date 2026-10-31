import phpParser from 'php-parser';
import { ParsedFileResult, ParsedSymbol, ParsedDependency, ParsedRoute, ParsedSchemaTable, RawChunk } from './types.js';
import { logger } from '../utils/logger.js';

const parser = new phpParser.Engine({
  parser: {
    extractDoc: true,
    php7: true,
    suppressErrors: true,
  },
  ast: {
    withPositions: true,
    withSource: true,
  },
});

export class PhpParser {
  public static parse(content: string, relativePath: string): ParsedFileResult {
    const symbols: ParsedSymbol[] = [];
    const dependencies: ParsedDependency[] = [];
    const routes: ParsedRoute[] = [];
    const tables: ParsedSchemaTable[] = [];
    const rawChunks: RawChunk[] = [];

    const lines = content.split('\n');

    try {
      const ast = parser.parseCode(content, relativePath);
      this.traverse(ast, {
        currentNamespace: '',
        currentClass: null,
        relativePath,
        symbols,
        dependencies,
        routes,
        tables,
        rawChunks,
        lines,
      });
    } catch (err) {
      logger.debug({ err, relativePath }, 'AST parse failed for PHP, applying regex fallback');
      this.parseWithRegexFallback(content, relativePath, symbols, dependencies, routes, tables, rawChunks, lines);
    }

    // Also extract Laravel routes and Schema migrations using regex to ensure 100% coverage
    this.extractRoutesRegex(content, relativePath, routes);
    this.extractSchemaMigrationsRegex(content, relativePath, tables);

    // If no chunks were generated, generate whole file chunk
    if (rawChunks.length === 0 && lines.length > 0) {
      rawChunks.push({
        symbolName: undefined,
        symbolType: 'file',
        startLine: 1,
        endLine: lines.length,
        content: content.trim(),
      });
    }

    return {
      symbols,
      dependencies,
      routes,
      tables,
      memories: [],
      rawChunks,
    };
  }

  private static traverse(node: any, context: {
    currentNamespace: string;
    currentClass: string | null;
    relativePath: string;
    symbols: ParsedSymbol[];
    dependencies: ParsedDependency[];
    routes: ParsedRoute[];
    tables: ParsedSchemaTable[];
    rawChunks: RawChunk[];
    lines: string[];
  }): void {
    if (!node || typeof node !== 'object') return;

    switch (node.kind) {
      case 'namespace': {
        const nsName = typeof node.name === 'string' ? node.name : node.name?.name || '';
        context.currentNamespace = nsName;
        if (Array.isArray(node.children)) {
          for (const child of node.children) {
            this.traverse(child, { ...context });
          }
        }
        return;
      }

      case 'usegroup': {
        if (Array.isArray(node.items)) {
          for (const item of node.items) {
            const target = item.name;
            const startLine = item.loc?.start?.line || 1;
            context.dependencies.push({
              targetModule: target,
              dependencyType: 'import',
              lineNumber: startLine,
            });
          }
        }
        break;
      }

      case 'class':
      case 'interface':
      case 'trait': {
        const className = typeof node.name === 'string' ? node.name : node.name?.name || 'AnonymousClass';
        const startLine = node.loc?.start?.line || 1;
        const endLine = node.loc?.end?.line || startLine;

        let kind: any = node.kind;
        if (context.relativePath.includes('Controller')) kind = 'controller';
        else if (context.relativePath.includes('Models/') || context.relativePath.includes('Model.php')) kind = 'model';
        else if (context.relativePath.includes('Middleware/')) kind = 'middleware';
        else if (context.relativePath.includes('Service/')) kind = 'service';

        context.symbols.push({
          name: className,
          kind,
          namespaceOrModule: context.currentNamespace,
          startLine,
          endLine,
          signature: `${node.kind} ${className}`,
          docstring: node.leadingComments ? node.leadingComments.map((c: any) => c.value).join('\n') : undefined,
          visibility: 'public',
        });

        // Check extends
        if (node.extends) {
          const parentClass = typeof node.extends === 'string' ? node.extends : node.extends.name || '';
          if (parentClass) {
            context.dependencies.push({
              targetModule: parentClass,
              dependencyType: 'extends',
              lineNumber: startLine,
            });
          }
        }

        // Check implements
        if (Array.isArray(node.implements)) {
          for (const imp of node.implements) {
            const iface = typeof imp === 'string' ? imp : imp.name || '';
            if (iface) {
              context.dependencies.push({
                targetModule: iface,
                dependencyType: 'implements',
                lineNumber: startLine,
              });
            }
          }
        }

        // Add chunk for class definition header + docblock
        const classHeaderLines = context.lines.slice(startLine - 1, Math.min(startLine + 10, endLine)).join('\n');
        context.rawChunks.push({
          symbolName: className,
          symbolType: kind,
          startLine,
          endLine: Math.min(startLine + 15, endLine),
          content: classHeaderLines,
        });

        const classContext = { ...context, currentClass: className };
        if (Array.isArray(node.body)) {
          for (const member of node.body) {
            this.traverse(member, classContext);
          }
        }
        return;
      }

      case 'method': {
        const methodName = typeof node.name === 'string' ? node.name : node.name?.name || '';
        const startLine = node.loc?.start?.line || 1;
        const endLine = node.loc?.end?.line || startLine;
        const visibility = node.visibility || 'public';

        context.symbols.push({
          name: methodName,
          kind: 'method',
          namespaceOrModule: context.currentNamespace,
          parentSymbol: context.currentClass || undefined,
          startLine,
          endLine,
          signature: `${visibility} function ${methodName}()`,
          docstring: node.leadingComments ? node.leadingComments.map((c: any) => c.value).join('\n') : undefined,
          visibility,
        });

        // Add chunk for method body
        const methodLines = context.lines.slice(startLine - 1, endLine).join('\n');
        if (methodLines.trim()) {
          context.rawChunks.push({
            symbolName: methodName,
            symbolType: 'method',
            parentSymbol: context.currentClass || undefined,
            startLine,
            endLine,
            content: methodLines,
          });
        }
        break;
      }

      case 'function': {
        const fnName = typeof node.name === 'string' ? node.name : node.name?.name || '';
        const startLine = node.loc?.start?.line || 1;
        const endLine = node.loc?.end?.line || startLine;

        context.symbols.push({
          name: fnName,
          kind: 'function',
          namespaceOrModule: context.currentNamespace,
          startLine,
          endLine,
          signature: `function ${fnName}()`,
          docstring: node.leadingComments ? node.leadingComments.map((c: any) => c.value).join('\n') : undefined,
          visibility: 'public',
        });

        const fnLines = context.lines.slice(startLine - 1, endLine).join('\n');
        if (fnLines.trim()) {
          context.rawChunks.push({
            symbolName: fnName,
            symbolType: 'function',
            startLine,
            endLine,
            content: fnLines,
          });
        }
        break;
      }
    }

    // Traverse children arrays or properties
    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      const val = (node as any)[key];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') {
            this.traverse(item, context);
          }
        }
      } else if (val && typeof val === 'object' && val.kind) {
        this.traverse(val, context);
      }
    }
  }

  private static extractRoutesRegex(content: string, relativePath: string, routes: ParsedRoute[]): void {
    const routeRegex = /Route::(get|post|put|delete|patch|options|any)\s*\(\s*['"]([^'"]+)['"]\s*,\s*(?:\[\s*([a-zA-Z0-9_\\]+)::class\s*,\s*['"]([a-zA-Z0-9_]+)['"]\s*\]|['"]([^'"]+)@([a-zA-Z0-9_]+)['"]|([a-zA-Z0-9_\\]+)::class|function)/gi;

    let match: RegExpExecArray | null;
    while ((match = routeRegex.exec(content)) !== null) {
      const httpMethod = match[1].toUpperCase();
      const uriPattern = match[2];
      const controller = match[3] || match[5] || match[7] || undefined;
      const action = match[4] || match[6] || undefined;

      // Calculate line number
      const before = content.slice(0, match.index);
      const lineNumber = before.split('\n').length;

      // Extract optional route name ->name('...')
      const followingText = content.slice(match.index, match.index + 200);
      const nameMatch = /->name\s*\(\s*['"]([^'"]+)['"]\s*\)/.exec(followingText);
      const routeName = nameMatch ? nameMatch[1] : undefined;

      routes.push({
        httpMethod,
        uriPattern,
        routeName,
        controller,
        action,
        lineNumber,
      });
    }
  }

  private static extractSchemaMigrationsRegex(content: string, relativePath: string, tables: ParsedSchemaTable[]): void {
    const schemaCreateRegex = /Schema::create\s*\(\s*['"]([^'"]+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([^}]+)\}\s*\)/gi;
    let match: RegExpExecArray | null;

    while ((match = schemaCreateRegex.exec(content)) !== null) {
      const tableName = match[1];
      const tableBody = match[2];

      const columns: any[] = [];
      const colRegex = /\$table->([a-zA-Z0-9_]+)\s*\(\s*['"]?([a-zA-Z0-9_]+)?['"]?/g;
      let colMatch: RegExpExecArray | null;

      while ((colMatch = colRegex.exec(tableBody)) !== null) {
        const type = colMatch[1];
        const name = colMatch[2] || type;
        if (type === 'id') {
          columns.push({
            columnName: 'id',
            dataType: 'bigint',
            isNullable: false,
            isPrimaryKey: true,
          });
        } else if (type === 'timestamps') {
          columns.push({ columnName: 'created_at', dataType: 'timestamp', isNullable: true, isPrimaryKey: false });
          columns.push({ columnName: 'updated_at', dataType: 'timestamp', isNullable: true, isPrimaryKey: false });
        } else {
          columns.push({
            columnName: name,
            dataType: type,
            isNullable: tableBody.includes(`->nullable()`),
            isPrimaryKey: false,
            foreignTable: type.includes('foreign') ? name.replace('_id', 's') : undefined,
          });
        }
      }

      tables.push({
        tableName,
        migrationFile: relativePath,
        columns,
      });
    }
  }

  private static parseWithRegexFallback(
    content: string,
    relativePath: string,
    symbols: ParsedSymbol[],
    dependencies: ParsedDependency[],
    routes: ParsedRoute[],
    tables: ParsedSchemaTable[],
    rawChunks: RawChunk[],
    lines: string[]
  ): void {
    // Regex for class/interface/trait
    const classRegex = /(?:class|interface|trait)\s+([a-zA-Z0-9_]+)(?:\s+extends\s+([a-zA-Z0-9_]+))?(?:\s+implements\s+([a-zA-Z0-9_,\s]+))?/g;
    let match: RegExpExecArray | null;

    while ((match = classRegex.exec(content)) !== null) {
      const className = match[1];
      const extendsClass = match[2];
      const lineNum = content.slice(0, match.index).split('\n').length;

      symbols.push({
        name: className,
        kind: 'class',
        startLine: lineNum,
        endLine: Math.min(lineNum + 50, lines.length),
        signature: match[0],
        visibility: 'public',
      });

      if (extendsClass) {
        dependencies.push({
          targetModule: extendsClass,
          dependencyType: 'extends',
          lineNumber: lineNum,
        });
      }
    }

    // Regex for functions and methods
    const fnRegex = /(?:(public|protected|private)\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/g;
    while ((match = fnRegex.exec(content)) !== null) {
      const visibility = (match[1] as any) || 'public';
      const fnName = match[2];
      const lineNum = content.slice(0, match.index).split('\n').length;

      symbols.push({
        name: fnName,
        kind: 'method',
        startLine: lineNum,
        endLine: Math.min(lineNum + 20, lines.length),
        signature: match[0],
        visibility,
      });
    }
  }
}
