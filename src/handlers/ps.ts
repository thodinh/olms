import { LMSTUDIO_URL } from "../config.ts";
import { withCors, errorResponse } from "../utils/cors.ts";

interface LMStudioModel {
  id: string;
  created?: number;
}

function toOllamaPsModel(m: LMStudioModel) {
  // expires_at: LMStudio keeps models loaded indefinitely — use a far future date
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  return {
    name: m.id,
    model: m.id,
    size: 0,
    digest: "",
    details: {
      parent_model: "",
      format: "gguf",
      family: "",
      families: [] as string[],
      parameter_size: "",
      quantization_level: "",
    },
    expires_at: expiresAt,
    size_vram: 0,
  };
}

export async function handlePs(): Promise<Response> {
  try {
    const upstream = await fetch(`${LMSTUDIO_URL}/models`);
    if (!upstream.ok) {
      return errorResponse(`LMStudio returned ${upstream.status}`, upstream.status);
    }
    const data = (await upstream.json()) as { data: LMStudioModel[] };
    const models = (data.data ?? []).map(toOllamaPsModel);
    return withCors(Response.json({ models }));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(msg);
  }
}
