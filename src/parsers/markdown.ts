import { ParsedFileResult, ParsedCuratedMemory, RawChunk } from './types.js';

export class MarkdownParser {
  public static parse(content: string, relativePath: string): ParsedFileResult {
    const memories: ParsedCuratedMemory[] = [];
    const rawChunks: RawChunk[] = [];
    const lines = content.split('\n');

    // Detect category from filename or path
    let defaultCategory: ParsedCuratedMemory['category'] = 'business_rule';
    const lowerPath = relativePath.toLowerCase();

    if (lowerPath.includes('business-rule') || lowerPath.includes('rule')) {
      defaultCategory = 'business_rule';
    } else if (lowerPath.includes('coding-standard') || lowerPath.includes('standard')) {
      defaultCategory = 'coding_standard';
    } else if (lowerPath.includes('decision') || lowerPath.includes('adr')) {
      defaultCategory = 'architecture_decision';
    } else if (lowerPath.includes('known-issue') || lowerPath.includes('issue') || lowerPath.includes('gotcha')) {
      defaultCategory = 'known_gotcha';
    }

    // Split markdown by headings (## or #)
    let currentHeading = 'Overview';
    let currentLines: string[] = [];
    let sectionStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = /^(#{1,3})\s+(.+)/.exec(line);

      if (headingMatch) {
        // Flush previous section
        if (currentLines.length > 0) {
          const sectionContent = currentLines.join('\n').trim();
          if (sectionContent) {
            rawChunks.push({
              symbolName: currentHeading,
              symbolType: 'doc_section',
              startLine: sectionStartLine,
              endLine: i,
              content: sectionContent,
            });

            if (lowerPath.includes('.ai/')) {
              memories.push({
                category: defaultCategory,
                topic: currentHeading,
                ruleStatement: sectionContent,
                status: 'approved',
              });
            }
          }
        }

        currentHeading = headingMatch[2].trim();
        currentLines = [line];
        sectionStartLine = i + 1;
      } else {
        currentLines.push(line);
      }
    }

    // Flush last section
    if (currentLines.length > 0) {
      const sectionContent = currentLines.join('\n').trim();
      if (sectionContent) {
        rawChunks.push({
          symbolName: currentHeading,
          symbolType: 'doc_section',
          startLine: sectionStartLine,
          endLine: lines.length,
          content: sectionContent,
        });

        if (lowerPath.includes('.ai/')) {
          memories.push({
            category: defaultCategory,
            topic: currentHeading,
            ruleStatement: sectionContent,
            status: 'approved',
          });
        }
      }
    }

    return {
      symbols: [],
      dependencies: [],
      routes: [],
      tables: [],
      memories,
      rawChunks,
    };
  }
}
