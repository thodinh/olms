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
  const mockDigest = "a6990ed6be41e15fac268393b3f2cf19e23f009e46a788bbdc7ac981cedd918b";
  const name = m.id.includes(":") ? m.id : `${m.id}:latest`;
  return {
    name,
    model: name,
    modified_at: m.created
      ? new Date(m.created * 1000).toISOString()
      : new Date().toISOString(),
    size: 6594474711,
    digest: mockDigest,
    details: {
      parent_model: "",
      format: "gguf",
      family: "llama",
      families: ["llama"],
      parameter_size: "7B",
      quantization_level: "Q4_0",
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
