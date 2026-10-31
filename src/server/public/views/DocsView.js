/**
 * View 13: Documentation View Component
 */
export function renderDocsView() {
  return `
    <section id="view-docs" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>System Documentation & Guides</h2>
          <p class="panel-sub">Complete technical reference, setup instructions, and Antigravity MCP integration</p>
        </div>
      </div>
      <div class="card">
        <div class="card-body markdown-body" id="docs-content">
          <h3>Welcome to code-context-mcp Local Admin</h3>
          <p>This dashboard is a dedicated local management console for your codebase RAG and MCP server.</p>
          <h4>Key Documentation Links:</h4>
          <ul>
            <li><strong>Architecture:</strong> <code>docs/architecture.md</code></li>
            <li><strong>Database Schema:</strong> <code>docs/database-schema.md</code> (MySQL 8.4 normalized schema)</li>
            <li><strong>Setup Guide:</strong> <code>docs/setup-guide.md</code> (Windows & Linux installation)</li>
            <li><strong>Antigravity MCP Setup:</strong> <code>docs/mcp-setup.md</code> (Connecting MCP stdio transport)</li>
            <li><strong>RAG Flow:</strong> <code>docs/rag-flow.md</code> (Chunking, AST parsing, and Reciprocal Rank Fusion)</li>
            <li><strong>Admin Dashboard:</strong> <code>docs/admin-dashboard.md</code> (Dashboard usage and management)</li>
            <li><strong>AI Model Configuration:</strong> <code>docs/ai-model-configuration.md</code> (OpenAI, Gemini, Claude, Ollama setup)</li>
            <li><strong>Security & API Keys:</strong> <code>docs/security.md</code> (AES-256-GCM encryption & project isolation)</li>
          </ul>
        </div>
      </div>
    </section>
  `;
}
