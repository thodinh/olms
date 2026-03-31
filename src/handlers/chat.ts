import { LMSTUDIO_URL } from "../config.ts";
import { mapOptions, type OllamaOptions } from "../mapOptions.ts";
import { withCors, errorResponse } from "../utils/cors.ts";
import { convertStream } from "../utils/streamConverter.ts";

interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  options?: OllamaOptions;
}

export async function handleChat(req: Request): Promise<Response> {
  let body: OllamaChatRequest;
  try {
    body = (await req.json()) as OllamaChatRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const shouldStream = body.stream !== false; // Ollama defaults to true

  const openaiReq = {
    model: body.model ?? "local-model",
    messages: body.messages ?? [],
    stream: shouldStream,
    ...mapOptions(body.options),
  };

  let upstream: Response;
  try {
    upstream = await fetch(`${LMSTUDIO_URL}/chat/completions`, {
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

  if (shouldStream) {
    const ndjsonStream = convertStream(upstream.body!, true, body.model);
    return withCors(
      new Response(ndjsonStream, {
        headers: { "Content-Type": "application/x-ndjson" },
      }),
    );
  }

  type OpenAIChatResponse = {
    choices: Array<{
      message: { role: string; content: string };
      finish_reason?: string;
    }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const data = (await upstream.json()) as OpenAIChatResponse;
  const choice = data.choices[0];

  const ollamaRes = {
    model: body.model,
    created_at: new Date().toISOString(),
    message: choice.message,
    done: true,
    done_reason: choice.finish_reason ?? "stop",
    total_duration: 0,
    load_duration: 0,
    prompt_eval_count: data.usage?.prompt_tokens ?? 0,
    eval_count: data.usage?.completion_tokens ?? 0,
  };

  return withCors(Response.json(ollamaRes));
}
