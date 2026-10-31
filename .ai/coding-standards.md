# Coding Standards

## 1. TypeScript & ES Modules
- Target: ES2022.
- Module system: NodeNext with native `.js` imports in transpiled code.
- Strict type checking enabled (`noImplicitAny`, `strictNullChecks`).
- Use Zod for schema validation across CLI parameters, config variables, and MCP tool arguments.

## 2. Database Operations
- All MySQL operations must utilize parameterized queries via `mysql2/promise`.
- Database write transactions must wrap atomic multi-table index operations.
- Relational tables must define proper foreign keys with `ON DELETE CASCADE`.

## 3. Error Handling & Logging
- Log output destined for diagnostics must write to structured log files or `stderr` when running the MCP server to avoid corrupting `stdout` JSON-RPC streams.
- Throw typed, identifiable errors with contextual diagnostics.
