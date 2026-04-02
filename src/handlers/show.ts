import { LMSTUDIO_URL } from "../config.ts";
import { withCors, errorResponse } from "../utils/cors.ts";
import { stripTag, inferCapabilities } from "../utils/modelName.ts";

interface ShowRequest {
  name?: string;
  model?: string;
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

  // Ollama official API uses 'name', but some clients use 'model' — accept both
  const modelName = body.name || body.model;
  if (!modelName) {
    return errorResponse("model is required", 400);
  }

  try {
    const upstream = await fetch(`${LMSTUDIO_URL}/models`);
    if (!upstream.ok) {
      return errorResponse(`LMStudio returned ${upstream.status}`, upstream.status);
    }
    const data = (await upstream.json()) as { data: LMStudioModel[] };
    // Try exact match first, then strip tag and retry
    let found = data.data?.find((m) => m.id === modelName);

    if (!found && modelName.includes(":")) {
      const stripped = stripTag(modelName);
      found = data.data?.find((m) => m.id === stripped);
    }

    if (!found) {
      return errorResponse(`model '${modelName}' not found`, 404);
    }

    // Build an Ollama-compatible show response.
    // Many fields have no LMStudio equivalent so we use safe empty defaults.
    const showRes = {
      license: "",
      modelfile: `# Model managed by LMStudio\nFROM ${found.id}\n`,
      parameters: "",
      template: "{{ .Prompt }}",
      details: {
        parent_model: "",
        format: "gguf",
        family: "llama",
        families: ["llama"],
        parameter_size: "7B",
        quantization_level: "Q4_0",
      },
      capabilities: inferCapabilities(found.id),
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
