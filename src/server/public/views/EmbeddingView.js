/**
 * View 10: Embedding Settings View Component
 */
export function renderEmbeddingView() {
  return `
    <section id="view-embedding-settings" class="view-panel">
      <div class="panel-header">
        <div>
          <h2>Embedding Settings</h2>
          <p class="panel-sub">Manage local vector embeddings strictly separate from chat/generation models</p>
        </div>
      </div>

      <div class="card max-w-2xl">
        <div class="card-body">
          <div class="alert alert-info mb-4">
            <strong>Embedding Isolation:</strong> Embedding models convert code into dense mathematical vectors stored in Qdrant. They are strictly separate from chat/generation models.
          </div>

          <form id="embedding-settings-form">
            <div class="form-group">
              <label for="emb-provider">Embedding Provider</label>
              <input type="text" id="emb-provider" class="form-control" value="ollama" readonly>
              <small class="text-muted">Local Ollama is the default local embedding provider.</small>
            </div>
            <div class="form-group">
              <label for="emb-model">Embedding Model Name</label>
              <input type="text" id="emb-model" class="form-control" required value="nomic-embed-text">
              <small class="text-muted">Default: <code>nomic-embed-text</code> (or <code>all-minilm</code>, <code>mxbai-embed-large</code>)</small>
            </div>
            <div class="form-group">
              <label for="emb-dimensions">Vector Dimensions</label>
              <input type="number" id="emb-dimensions" class="form-control" required value="768">
              <small class="text-muted">Must match model output (e.g. 768 for nomic-embed-text, 384 for all-minilm, 1024 for mxbai).</small>
            </div>
            <div class="form-group">
              <label for="emb-batch-size">Batch Size</label>
              <input type="number" id="emb-batch-size" class="form-control" required value="32">
              <small class="text-muted">Number of chunks embedded per batch request.</small>
            </div>

            <div id="emb-reindex-warning" class="alert alert-warning hidden mt-3">
              <strong>Warning:</strong> Changing the embedding model or vector dimensions requires rebuilding existing Qdrant vector collections.
            </div>

            <div class="mt-4">
              <button type="submit" class="btn btn-primary" id="save-emb-settings-btn">Save Embedding Settings</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `;
}
