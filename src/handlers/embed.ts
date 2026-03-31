import { LMSTUDIO_URL } from "../config.ts";
import { mapOptions, type OllamaOptions } from "../mapOptions.ts";
import { withCors, errorResponse } from "../utils/cors.ts";

interface OllamaEmbedRequest {
  model: string;
  /** New API: accepts a single string or array of strings */
  input?: string | string[];
  /** Legacy API: single string */
  prompt?: string;
  options?: OllamaOptions;
}

type EmbeddingData = Array<{ embedding: number[]; index: number }>;

interface OpenAIEmbeddingsResponse {
  data: EmbeddingData;
  usage?: { prompt_tokens?: number };
}

export async function handleEmbed(req: Request, isLegacy: boolean): Promise<Response> {
  let body: OllamaEmbedRequest;
  try {
    body = (await req.json()) as OllamaEmbedRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  // Normalise input: legacy uses `prompt` (string), new API uses `input` (string | string[])
  let input: string | string[];
  if (isLegacy) {
    input = body.prompt ?? body.input ?? "";
    if (Array.isArray(input)) input = input[0] ?? "";
  } else {
    input = body.input ?? body.prompt ?? "";
  }
  // Always send as array to OpenAI
  const inputArray: string[] = Array.isArray(input) ? input : [input];

  const openaiReq = {
    model: body.model ?? "local-model",
    input: inputArray,
    ...mapOptions(body.options),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${LMSTUDIO_URL}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(openaiReq),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to reach LMStudio";
    return errorResponse(msg, 502);
  }

  if (!upstream.ok) {
    const text = await upstream.text();
    return errorResponse(text || `LMStudio returned ${upstream.status}`, upstream.status);
  }

  const data = (await upstream.json()) as OpenAIEmbeddingsResponse;

  if (isLegacy) {
    // /api/embeddings → legacy format: { embedding: float[] }
    return withCors(
      Response.json({
        embedding: data.data[0]?.embedding ?? [],
      }),
    );
  } else {
    // /api/embed → new format: { model, embeddings: float[][], total_duration, ... }
    return withCors(
      Response.json({
        model: body.model,
        embeddings: data.data.map((d) => d.embedding),
        total_duration: 0,
        load_duration: 0,
        prompt_eval_count: data.usage?.prompt_tokens ?? 0,
      }),
    );
  }
}
