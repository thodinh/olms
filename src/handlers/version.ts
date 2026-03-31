import { withCors } from "../utils/cors.ts";

const OLLAMA_VERSION = "0.3.0";

export function handleVersion(): Response {
  return withCors(Response.json({ version: OLLAMA_VERSION }));
}
