import { LMSTUDIO_URL } from "../config.ts";
import { withCors, errorResponse } from "../utils/cors.ts";

interface LMStudioModel {
  id: string;
  created?: number;
}

function toOllamaPsModel(m: LMStudioModel) {
  // expires_at: LMStudio keeps models loaded indefinitely — use a far future date
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const mockDigest = "a6990ed6be41e15fac268393b3f2cf19e23f009e46a788bbdc7ac981cedd918b";
  const name = m.id;
  return {
    name,
    model: name,
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
    expires_at: expiresAt,
    size_vram: 6594474711,
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
