import { afterAll, beforeAll } from "bun:test";

export const LMSTUDIO_URL = process.env.LMSTUDIO_URL ?? "http://localhost:11434/v1";
export const BRIDGE_PORT = 19998; // Hardcode to 19998 to guarantee no collisions
export const BRIDGE_URL = `http://localhost:${BRIDGE_PORT}`;
export const TEST_CHAT_MODEL = process.env.TEST_CHAT_MODEL ?? "qwen3.5-4b-mlx";
export const TEST_EMBED_MODEL =
  process.env.TEST_EMBED_MODEL ?? "text-embedding-nomic-embed-text-v1.5";

export async function isLMStudioReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LMSTUDIO_URL}/models`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function requireLMStudio() {
  const reachable = await isLMStudioReachable();
  if (!reachable) {
    console.warn(
      `\n⚠️  Skipping integration tests — LMStudio not reachable at ${LMSTUDIO_URL}\n`,
    );
    process.exit(0);
  }
}

let server: ReturnType<typeof Bun.serve> | null = null;

export function startBridge() {
  beforeAll(async () => {
    await requireLMStudio();
    process.env.LMSTUDIO_URL = LMSTUDIO_URL;
    process.env.PORT = String(BRIDGE_PORT);

    const { handleTags } = await import("../../src/handlers/tags.ts");
    const { handleChat } = await import("../../src/handlers/chat.ts");
    const { handleGenerate } = await import("../../src/handlers/generate.ts");
    const { handleEmbed } = await import("../../src/handlers/embed.ts");
    const { handleVersion } = await import("../../src/handlers/version.ts");
    const { handlePs } = await import("../../src/handlers/ps.ts");
    const { handleShow } = await import("../../src/handlers/show.ts");
    const { handleNotSupported } = await import("../../src/handlers/notSupported.ts");
    const { corsPreflightResponse, errorResponse, withCors } = await import("../../src/utils/cors.ts");

    server = Bun.serve({
      port: BRIDGE_PORT,
      async fetch(req) {
        const url = new URL(req.url);
        const { method } = req;
        const pathname = url.pathname;

        if (method === "OPTIONS") return corsPreflightResponse();
        if ((method === "GET" || method === "HEAD") && pathname === "/") {
          return withCors(
            new Response(method === "HEAD" ? null : "Ollama is running", {
              headers: { "Content-Type": "text/plain" },
            })
          );
        }

        if (pathname.startsWith("/v1/")) {
          const targetPath = pathname.replace(/^\/v1/, "") + url.search;
          const targetUrl = process.env.LMSTUDIO_URL!.replace(/\/$/, "") + targetPath;
          const headers = new Headers(req.headers);
          headers.delete("host");
          try {
            const upstream = await fetch(targetUrl, {
              method,
              headers,
              body: method !== "GET" && method !== "HEAD" ? req.body : undefined,
            });
            return withCors(new Response(upstream.body, {
              status: upstream.status,
              statusText: upstream.statusText,
              headers: upstream.headers,
            }));
          } catch (err: any) {
            return errorResponse("LMStudio unreachable: " + err.message, 502);
          }
        }
        if (method === "GET" && pathname === "/api/tags") return handleTags();
        if (method === "POST" && pathname === "/api/chat") return handleChat(req);
        if (method === "POST" && pathname === "/api/generate") return handleGenerate(req);
        if (method === "POST" && pathname === "/api/embed") return handleEmbed(req, false);
        if (method === "POST" && pathname === "/api/embeddings") return handleEmbed(req, true);
        if (method === "GET" && pathname === "/api/version") return handleVersion();
        if (method === "GET" && pathname === "/api/ps") return handlePs();
        if (method === "POST" && pathname === "/api/show") return handleShow(req);
        if (pathname === "/api/copy") return handleNotSupported("POST /api/copy");
        if (pathname === "/api/delete") return handleNotSupported("DELETE /api/delete");
        if (pathname === "/api/pull") return handleNotSupported("POST /api/pull");
        if (pathname === "/api/push") return handleNotSupported("POST /api/push");
        if (pathname === "/api/create") return handleNotSupported("POST /api/create");
        if (pathname.startsWith("/api/blobs")) return handleNotSupported("POST /api/blobs");
        return errorResponse("Not Found", 404);
      },
    });
  });

  afterAll(() => {
    server?.stop(true);
    server = null;
  });
}
