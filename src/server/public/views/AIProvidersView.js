/**
 * View 9: AI Model Providers View Component
 */
export function renderAIProvidersView() {
  return `
    <section id="view-ai-models" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>AI Model Providers & Settings</h2>
          <p class="panel-sub">Configure OpenAI, Gemini, Claude, and local Ollama with secure AES-256 encrypted keys</p>
        </div>
        <button id="open-provider-modal-btn" class="btn btn-primary">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Provider
        </button>
      </div>

      <div class="card mb-4">
        <div class="card-header">
          <h3>Configured Model Providers</h3>
        </div>
        <div class="card-body p-0">
          <table class="table" id="providers-table">
            <thead>
              <tr>
                <th>Provider Name</th>
                <th>Type</th>
                <th>API Key</th>
                <th>Base URL</th>
                <th>Default Model</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr><td colspan="7" class="text-center text-muted">Loading providers...</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3>Task-Specific Model Assignments</h3>
        </div>
        <div class="card-body">
          <p class="text-muted mb-3">Assign different AI models to specialized assistant tasks:</p>
          <form id="model-assignments-form">
            <div class="assignment-grid" id="assignment-grid">
              <!-- Populated dynamically -->
            </div>
            <div class="mt-4">
              <button type="submit" class="btn btn-primary">Save Model Assignments</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `;
}
