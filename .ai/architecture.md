# Architecture Overview

## Core System Purpose
`code-context-mcp` is a standalone developer intelligence engine providing deep semantic and AST-level code context to AI coding assistants (such as Google Antigravity) via the Model Context Protocol (MCP).

## Key Components
1. **MCP Server**: Stdio JSON-RPC transport adhering to Model Context Protocol specification.
2. **Project Registry**: Multi-project registration and workspace isolation layer.
3. **AST Parsers**: Custom parsers for PHP (Laravel), JavaScript / TypeScript (React), SQL, and Markdown.
4. **Hybrid RAG Search Engine**: Weighted Reciprocal Rank Fusion of exact symbols, file paths, MySQL FULLTEXT, and Qdrant vector semantic results.
5. **Dependency & Impact Engine**: Bi-directional graph mapper analyzing caller/callee, route/controller, and model/table relationships.
6. **Persistence**: MySQL 8.4 as the sole relational database, Qdrant as the vector store, and Ollama as the local embedding engine.

