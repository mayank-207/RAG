import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import { ParsedFileResult, ParsedSymbol, ParsedDependency, ParsedRoute, RawChunk } from './types.js';
import { logger } from '../utils/logger.js';

const traverse = (_traverse as any).default || _traverse;

export class JavaScriptParser {
  public static parse(content: string, relativePath: string): ParsedFileResult {
    const symbols: ParsedSymbol[] = [];
    const dependencies: ParsedDependency[] = [];
    const routes: ParsedRoute[] = [];
    const rawChunks: RawChunk[] = [];

    const lines = content.split('\n');

    try {
      const ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          ['decorators', { decoratorsBeforeExport: true }],
          'classProperties',
          'asyncGenerators',
          'dynamicImport',
          'exportDefaultFrom',
          'exportNamespaceFrom',
        ],
        errorRecovery: true,
      });

      traverse(ast, {
        // Imports
        ImportDeclaration(path: any) {
          const targetModule = path.node.source.value;
          const startLine = path.node.loc?.start.line || 1;

          for (const specifier of path.node.specifiers) {
            const sym = specifier.local?.name || '';
            dependencies.push({
              targetModule,
              targetSymbol: sym,
              dependencyType: 'import',
              lineNumber: startLine,
            });
          }
        },

        // Functions & Functional Components / Hooks
        FunctionDeclaration(path: any) {
          const fnName = path.node.id?.name;
          if (!fnName) return;

          const startLine = path.node.loc?.start.line || 1;
          const endLine = path.node.loc?.end.line || startLine;

          let kind: any = 'function';
          if (/^[A-Z]/.test(fnName)) {
            kind = 'component';
          } else if (/^use[A-Z0-9]/.test(fnName)) {
            kind = 'hook';
          }

          symbols.push({
            name: fnName,
            kind,
            startLine,
            endLine,
            signature: `function ${fnName}()`,
            visibility: path.parent.type.includes('Export') ? 'export' : undefined,
          });

          const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
          if (chunkContent.trim()) {
            rawChunks.push({
              symbolName: fnName,
              symbolType: kind,
              startLine,
              endLine,
              content: chunkContent,
            });
          }
        },

        // Arrow Functions (Components, Hooks, Lambdas)
        VariableDeclaration(path: any) {
          const isExported = path.parent.type.includes('Export');

          for (const decl of path.node.declarations) {
            const name = decl.id?.name;
            if (!name) continue;

            const init = decl.init;
            if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
              const startLine = path.node.loc?.start.line || 1;
              const endLine = path.node.loc?.end.line || startLine;

              let kind: any = 'function';
              if (/^[A-Z]/.test(name)) {
                kind = 'component';
              } else if (/^use[A-Z0-9]/.test(name)) {
                kind = 'hook';
              }

              symbols.push({
                name,
                kind,
                startLine,
                endLine,
                signature: `const ${name} = (...) => ...`,
                visibility: isExported ? 'export' : undefined,
              });

              const chunkContent = lines.slice(startLine - 1, endLine).join('\n');
              if (chunkContent.trim()) {
                rawChunks.push({
                  symbolName: name,
                  symbolType: kind,
                  startLine,
                  endLine,
                  content: chunkContent,
                });
              }
            }
          }
        },

        // Classes & React Class Components
        ClassDeclaration(path: any) {
          const className = path.node.id?.name || 'AnonymousClass';
          const startLine = path.node.loc?.start.line || 1;
          const endLine = path.node.loc?.end.line || startLine;

          let kind: any = 'class';
          if (path.node.superClass) {
            const superName = path.node.superClass.name || path.node.superClass.property?.name;
            if (superName === 'Component' || superName === 'PureComponent') {
              kind = 'component';
            }
            dependencies.push({
              targetModule: superName || 'UnknownClass',
              dependencyType: 'extends',
              lineNumber: startLine,
            });
          }

          symbols.push({
            name: className,
            kind,
            startLine,
            endLine,
            signature: `class ${className}`,
            visibility: path.parent.type.includes('Export') ? 'export' : undefined,
          });

          const classChunk = lines.slice(startLine - 1, Math.min(startLine + 15, endLine)).join('\n');
          rawChunks.push({
            symbolName: className,
            symbolType: kind,
            startLine,
            endLine: Math.min(startLine + 15, endLine),
            content: classChunk,
          });
        },

        // Class Methods
        ClassMethod(path: any) {
          const methodName = path.node.key?.name;
          if (!methodName) return;

          const startLine = path.node.loc?.start.line || 1;
          const endLine = path.node.loc?.end.line || startLine;
          const parentClass = path.findParent((p: any) => p.isClassDeclaration())?.node?.id?.name;

          symbols.push({
            name: methodName,
            kind: 'method',
            parentSymbol: parentClass,
            startLine,
            endLine,
            signature: `${methodName}()`,
            visibility: path.node.accessibility || 'public',
          });

          const methodChunk = lines.slice(startLine - 1, endLine).join('\n');
          if (methodChunk.trim()) {
            rawChunks.push({
              symbolName: methodName,
              symbolType: 'method',
              parentSymbol: parentClass,
              startLine,
              endLine,
              content: methodChunk,
            });
          }
        },

        // API Calls & Route detection
        CallExpression(path: any) {
          const callee = path.node.callee;
          const startLine = path.node.loc?.start.line || 1;

          // fetch or axios calls
          if (callee.name === 'fetch' || (callee.object?.name === 'axios')) {
            const firstArg = path.node.arguments[0]?.value;
            if (typeof firstArg === 'string') {
              dependencies.push({
                targetModule: firstArg,
                dependencyType: 'calls',
                lineNumber: startLine,
              });
            }
          }
        },

        // JSX Element component usages & Route tags
        JSXElement(path: any) {
          const nameNode = path.node.openingElement.name;
          const tagName = nameNode.name || nameNode.property?.name;
          const startLine = path.node.loc?.start.line || 1;

          if (tagName === 'Route') {
            let pathVal: string | undefined;
            let elementVal: string | undefined;

            for (const attr of path.node.openingElement.attributes) {
              if (attr.name?.name === 'path' && attr.value?.value) {
                pathVal = attr.value.value;
              } else if (attr.name?.name === 'element' && attr.value?.expression) {
                elementVal = attr.value.expression.openingElement?.name?.name;
              } else if (attr.name?.name === 'component' && attr.value?.name) {
                elementVal = attr.value.name;
              }
            }

            if (pathVal) {
              routes.push({
                httpMethod: 'GET',
                uriPattern: pathVal,
                controller: elementVal,
                lineNumber: startLine,
              });
            }
          } else if (tagName && /^[A-Z]/.test(tagName)) {
            // Child component relationship
            dependencies.push({
              targetModule: tagName,
              dependencyType: 'renders_component',
              lineNumber: startLine,
            });
          }
        },
      });
    } catch (err) {
      logger.debug({ err, relativePath }, 'Babel AST parse failed, applying regex fallback');
      this.parseWithRegexFallback(content, relativePath, symbols, dependencies, rawChunks, lines);
    }

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
      tables: [],
      memories: [],
      rawChunks,
    };
  }

  private static parseWithRegexFallback(
    content: string,
    relativePath: string,
    symbols: ParsedSymbol[],
    dependencies: ParsedDependency[],
    rawChunks: RawChunk[],
    lines: string[]
  ): void {
    // Import regex
    const importRegex = /import\s+(?:\{([^}]+)\}|([a-zA-Z0-9_]+))\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = importRegex.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split('\n').length;
      dependencies.push({
        targetModule: match[3],
        targetSymbol: match[1] || match[2],
        dependencyType: 'import',
        lineNumber: lineNum,
      });
    }

    // Function/Component regex
    const fnRegex = /(?:export\s+)?(?:default\s+)?(?:function|const)\s+([A-Za-z0-9_]+)/g;
    while ((match = fnRegex.exec(content)) !== null) {
      const name = match[1];
      const lineNum = content.slice(0, match.index).split('\n').length;
      let kind: any = 'function';
      if (/^[A-Z]/.test(name)) kind = 'component';
      else if (/^use[A-Z0-9]/.test(name)) kind = 'hook';

      symbols.push({
        name,
        kind,
        startLine: lineNum,
        endLine: Math.min(lineNum + 30, lines.length),
        signature: match[0],
      });
    }
  }
}
