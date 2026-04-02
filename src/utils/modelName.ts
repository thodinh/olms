// Heuristic patterns for embedding model detection
const EMBEDDING_PATTERNS = [/embed/i, /^bge[-_]/i, /^e5[-_]/i, /^gte[-_]/i, /minilm/i, /^jina[-_].*v\d/i];

export function isEmbeddingModel(modelId: string): boolean {
  return EMBEDDING_PATTERNS.some((p) => p.test(modelId));
}

export function inferCapabilities(modelId: string): string[] {
  return isEmbeddingModel(modelId) ? ["embedding"] : ["completion", "chat"];
}

// Strip Ollama tag from model name (e.g. "model:latest" → "model")
// Needed because some clients auto-append `:latest` even though LMStudio doesn't use tags
export function stripTag(model: string): string {
  const i = model.lastIndexOf(":");
  return i === -1 ? model : model.slice(0, i);
}
