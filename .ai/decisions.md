# Architectural Decisions (ADR)

## ADR-001: Choice of MySQL 8.4 as Sole Relational Database
- **Decision**: Use MySQL 8.4 exclusively. Reject SQLite and PostgreSQL.
- **Rationale**: Meets enterprise developer requirement for robust InnoDB transactions, native FULLTEXT search capabilities, and compatibility with developers running local MySQL stacks (Laragon, Docker, Linux native).

## ADR-002: Local Vector Database with Qdrant
- **Decision**: Store dense embeddings in local Qdrant instance.
- **Rationale**: Avoids cloud egress fees, guarantees sub-millisecond semantic search, supports rich metadata filtering for multi-workspace isolation.

## ADR-003: Local Embeddings via Ollama
- **Decision**: Ollama using `nomic-embed-text` (768 dims).
- **Rationale**: Completely local, cost-free embedding generation without exposing proprietary client source code to external cloud providers.

## ADR-004: AST-First Parsing with Fallback Chunker
- **Decision**: Parse PHP via `php-parser` and JS/TS/React via `@babel/parser`.
- **Rationale**: Accurate identification of classes, methods, components, and hooks. If a file contains invalid syntax, a line-bounded fallback chunker preserves indexed coverage.
