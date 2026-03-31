import { withCors } from "../utils/cors.ts";

const REASON =
  "LMStudio does not expose this operation via its API. " +
  "Use the LMStudio desktop app to manage models.";

export function handleNotSupported(endpoint: string): Response {
  return withCors(
    new Response(
      JSON.stringify({ error: `${endpoint} is not supported by this bridge. ${REASON}` }),
      {
        status: 501,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );
}
