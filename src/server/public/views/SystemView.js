/**
 * View 11: System Settings & Diagnostics View Component
 */
export function renderSystemView() {
  return `
    <section id="view-system" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>System Settings & Diagnostics</h2>
          <p class="panel-sub">Live health and configuration for MySQL 8.4, Qdrant, Ollama, and MCP</p>
        </div>
      </div>

      <div class="system-cards-grid" id="system-cards-container">
        <!-- Populated dynamically -->
      </div>
    </section>
  `;
}
