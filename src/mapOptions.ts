export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  stop?: string | string[];
  num_predict?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  /** Alias for frequency_penalty used by some Ollama clients */
  repeat_penalty?: number;
  [key: string]: unknown;
}

export interface OpenAIParams {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
}

/**
 * Converts Ollama `options` block to OpenAI-compatible request parameters.
 * Unknown keys are silently ignored.
 */
export function mapOptions(options: OllamaOptions = {}): OpenAIParams {
  const params: OpenAIParams = {};

  if (options.temperature !== undefined) params.temperature = options.temperature;
  if (options.top_p !== undefined) params.top_p = options.top_p;
  if (options.top_k !== undefined) params.top_k = options.top_k;
  if (options.seed !== undefined) params.seed = options.seed;
  if (options.stop !== undefined) params.stop = options.stop;
  if (options.num_predict !== undefined) params.max_tokens = options.num_predict;
  if (options.presence_penalty !== undefined) params.presence_penalty = options.presence_penalty;

  // frequency_penalty wins over repeat_penalty if both are present
  if (options.frequency_penalty !== undefined) {
    params.frequency_penalty = options.frequency_penalty;
  } else if (options.repeat_penalty !== undefined) {
    params.frequency_penalty = options.repeat_penalty;
  }

  return params;
}
