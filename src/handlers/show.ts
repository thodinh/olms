import { LMSTUDIO_URL } from "../config.ts";
import { withCors, errorResponse } from "../utils/cors.ts";

interface ShowRequest {
  model: string;
  verbose?: boolean;
}

interface LMStudioModel {
  id: string;
  created?: number;
  object?: string;
  owned_by?: string;
}

export async function handleShow(req: Request): Promise<Response> {
  let body: ShowRequest;
  try {
    body = (await req.json()) as ShowRequest;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  if (!body.model) {
    return errorResponse("model is required", 400);
  }

  try {
    const upstream = await fetch(`${LMSTUDIO_URL}/models`);
    if (!upstream.ok) {
      return errorResponse(`LMStudio returned ${upstream.status}`, upstream.status);
    }
    const data = (await upstream.json()) as { data: LMStudioModel[] };
    const found = data.data?.find((m) => m.id === body.model);

    if (!found) {
      return errorResponse(`model '${body.model}' not found`, 404);
    }

    // Build an Ollama-compatible show response.
    // Many fields have no LMStudio equivalent so we use safe empty defaults.
    const showRes = {
      modelfile: `# Model managed by LMStudio\nFROM ${found.id}\n`,
      parameters: "",
      template: "{{ .Prompt }}",
      details: {
        parent_model: "",
        format: "gguf",
        family: "",
        families: [] as string[],
        parameter_size: "",
        quantization_level: "",
      },
      model_info: {
        "general.architecture": "",
        "general.basename": found.id,
        "general.name": found.id,
        "general.parameter_count": 0,
      },
      modified_at: found.created
        ? new Date(found.created * 1000).toISOString()
        : new Date().toISOString(),
    };

    return withCors(Response.json(showRes));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return errorResponse(msg);
  }
}
