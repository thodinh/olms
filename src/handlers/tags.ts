import { LMSTUDIO_URL } from "../config.ts";
import { withCors, errorResponse } from "../utils/cors.ts";

interface LMStudioModel {
  id: string;
  created?: number;
  object?: string;
  owned_by?: string;
}

interface LMStudioModelsResponse {
  data: LMStudioModel[];
}

function toOllamaModel(m: LMStudioModel) {
  return {
    name: m.id,
    model: m.id,
    modified_at: m.created
      ? new Date(m.created * 1000).toISOString()
      : new Date().toISOString(),
    size: 0,
    digest: "",
    details: {
      format: "gguf",
      family: "",
      families: [] as string[],
      parameter_size: "",
      quantization_level: "",
    },
  };
}

export async function handleTags(): Promise<Response> {
  try {
    const upstream = await fetch(`${LMSTUDIO_URL}/models`);
    if (!upstream.ok) {
      return errorResponse(`LMStudio returned ${upstream.status}`, upstream.status);
    }
    const data = (await upstream.json()) as LMStudioModelsResponse;
    const models = (data.data ?? []).map(toOllamaModel);
    return withCors(Response.json({ models }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(msg);
  }
}
