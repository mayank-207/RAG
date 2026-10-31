import { ParsedFileResult, ParsedSchemaTable, ParsedSchemaColumn, RawChunk } from './types.js';

export class SqlParser {
  public static parse(content: string, relativePath: string): ParsedFileResult {
    const tables: ParsedSchemaTable[] = [];
    const rawChunks: RawChunk[] = [];
    const lines = content.split('\n');

    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\(([\s\S]*?)\)(?:\s*ENGINE\s*=\s*[a-zA-Z0-9]+)?;/gi;
    let match: RegExpExecArray | null;

    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[1];
      const tableBody = match[2];

      const before = content.slice(0, match.index);
      const startLine = before.split('\n').length;
      const endLine = startLine + match[0].split('\n').length - 1;

      const columns: ParsedSchemaColumn[] = [];
      const colLines = tableBody.split(/,\s*[\r\n]+/);

      for (const line of colLines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('--')) continue;

        if (/^PRIMARY\s+KEY/i.test(trimmed)) {
          const pkMatch = /\(([^)]+)\)/.exec(trimmed);
          if (pkMatch) {
            const pkCols = pkMatch[1].split(',').map((c) => c.replace(/[`"'\s]/g, ''));
            for (const col of columns) {
              if (pkCols.includes(col.columnName)) {
                col.isPrimaryKey = true;
              }
            }
          }
          continue;
        }

        if (/^FOREIGN\s+KEY/i.test(trimmed) || /^CONSTRAINT/i.test(trimmed)) {
          const fkMatch = /FOREIGN\s+KEY\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)\s*REFERENCES\s*[`"']?([a-zA-Z0-9_]+)[`"']?\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)/i.exec(trimmed);
          if (fkMatch) {
            const colName = fkMatch[1];
            const refTable = fkMatch[2];
            const refCol = fkMatch[3];
            const col = columns.find((c) => c.columnName === colName);
            if (col) {
              col.foreignTable = refTable;
              col.foreignColumn = refCol;
            }
          }
          continue;
        }

        const colDefMatch = /^[`"']?([a-zA-Z0-9_]+)[`"']?\s+([a-zA-Z0-9_]+(?:\([^)]+\))?)/i.exec(trimmed);
        if (colDefMatch) {
          const colName = colDefMatch[1];
          const dataType = colDefMatch[2];
          const isPk = /PRIMARY\s+KEY/i.test(trimmed);
          const isNullable = !/NOT\s+NULL/i.test(trimmed);

          let foreignTable: string | undefined;
          let foreignColumn: string | undefined;
          const refInlineMatch = /REFERENCES\s+[`"']?([a-zA-Z0-9_]+)[`"']?\s*\([`"']?([a-zA-Z0-9_]+)[`"']?\)/i.exec(trimmed);
          if (refInlineMatch) {
            foreignTable = refInlineMatch[1];
            foreignColumn = refInlineMatch[2];
          }

          columns.push({
            columnName: colName,
            dataType,
            isNullable,
            isPrimaryKey: isPk,
            foreignTable,
            foreignColumn,
          });
        }
      }

      tables.push({
        tableName,
        migrationFile: relativePath,
        columns,
      });

      rawChunks.push({
        symbolName: tableName,
        symbolType: 'schema_table',
        startLine,
        endLine,
        content: match[0],
      });
    }

    if (rawChunks.length === 0 && lines.length > 0) {
      rawChunks.push({
        symbolName: undefined,
        symbolType: 'sql_file',
        startLine: 1,
        endLine: lines.length,
        content: content.trim(),
      });
    }

    return {
      symbols: [],
      dependencies: [],
      routes: [],
      tables,
      memories: [],
      rawChunks,
    };
  }
}
