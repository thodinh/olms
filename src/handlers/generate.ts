import { LMSTUDIO_URL } from "../config.ts";
import { mapOptions, type OllamaOptions } from "../mapOptions.ts";
import { withCors, errorResponse } from "../utils/cors.ts";
import { convertStream } from "../utils/streamConverter.ts";

interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  options?: OllamaOptions;
}

export async function handleGenerate(req: Request): Promise<Response> {
  let body: OllamaGenerateRequest;
  try {
    body = (await req.json()) as OllamaGenerateRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const shouldStream = body.stream !== false; // Ollama defaults to true

  const openaiReq = {
    model: body.model ?? "local-model",
    prompt: body.prompt ?? "",
    stream: shouldStream,
    ...mapOptions(body.options),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${LMSTUDIO_URL}/completions`, {
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

  // --- Streaming ---
  if (shouldStream) {
    const ndjsonStream = convertStream(upstream.body!, false, body.model);
    return withCors(
      new Response(ndjsonStream, {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
  }

  // --- Non-streaming ---
  type OpenAICompletionResponse = {
    choices: Array<{ text: string; finish_reason?: string }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const data = (await upstream.json()) as OpenAICompletionResponse;
  const choice = data.choices[0];

  const ollamaRes = {
    model: body.model,
    created_at: new Date().toISOString(),
    response: choice.text,
    done: true,
    done_reason: choice.finish_reason ?? "stop",
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: data.usage?.prompt_tokens ?? 0,
    eval_count: data.usage?.completion_tokens ?? 0,
  };

  return withCors(Response.json(ollamaRes));
}
