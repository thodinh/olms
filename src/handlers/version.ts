import { withCors } from "../utils/cors.ts";
import { OLLAMA_VERSION } from "../config.ts";

export function handleVersion(): Response {
  return withCors(Response.json({ version: OLLAMA_VERSION }));
}
