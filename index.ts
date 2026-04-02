#!/usr/bin/env bun
import { PORT, LMSTUDIO_URL, VERBOSE, POSITIONAL_ARGS } from "./src/config.ts";
import { corsPreflightResponse, errorResponse, withCors } from "./src/utils/cors.ts";
import { handleTags } from "./src/handlers/tags.ts";
import { handleChat } from "./src/handlers/chat.ts";
import { handleGenerate } from "./src/handlers/generate.ts";
import { handleEmbed } from "./src/handlers/embed.ts";
import { handleVersion } from "./src/handlers/version.ts";
import { handlePs } from "./src/handlers/ps.ts";
import { handleShow } from "./src/handlers/show.ts";
import { handleNotSupported } from "./src/handlers/notSupported.ts";
import { logRequest, logResponse, logUpstream, logDebug } from "./src/utils/logger.ts";
import { stripTag } from "./src/utils/modelName.ts";

if (POSITIONAL_ARGS[0] === "service") {
  const { handleServiceCommand } = await import("./src/utils/service.ts");
  handleServiceCommand(POSITIONAL_ARGS[1] ?? "");
  process.exit(0);
}


const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { method, pathname } = { method: req.method, pathname: url.pathname };

    let requestBody: unknown;
    if (VERBOSE && (method === "POST" || method === "PUT" || method === "PATCH")) {
      try {
        const cloned = req.clone();
        requestBody = await cloned.json();
      } catch {
        // body might not be JSON, that's fine
      }
    }

    logRequest(method, pathname, requestBody);

    async function handleAndLog(handler: () => Response | Promise<Response>): Promise<Response> {
      const res = await handler();
      if (!VERBOSE) return res;

      const contentType = res.headers.get("content-type") ?? "";
      const isStream =
        contentType.includes("text/event-stream") ||
        contentType.includes("application/x-ndjson");

      if (!isStream) {
        try {
          const cloned = res.clone();
          const body = await cloned.json();
          logResponse(method, pathname, res.status, body);
        } catch {
          logResponse(method, pathname, res.status);
        }
        return res;
      }

      // Stream handling — supports both NDJSON (Ollama) and SSE (OpenAI) formats
      logResponse(method, pathname, res.status, "(streaming started)");

      if (res.body) {
        const [streamForClient, streamForLogging] = res.body.tee();

        (async () => {
          try {
            const reader = streamForLogging.getReader();
            const decoder = new TextDecoder();
            let fullText = "";
            let finalDoneChunk: any = null;
            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() ?? "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === "data: [DONE]") continue;

                // Handle both NDJSON (raw JSON lines) and SSE (data: JSON lines)
                let jsonStr = trimmed;
                if (trimmed.startsWith("data: ")) {
                  jsonStr = trimmed.slice(6);
                }

                try {
                  const chunk = JSON.parse(jsonStr);

                  // Ollama NDJSON format
                  if (chunk.message?.content) fullText += chunk.message.content;
                  else if (chunk.response) fullText += chunk.response;

                  // OpenAI SSE format
                  const delta = chunk.choices?.[0]?.delta;
                  if (delta?.content) fullText += delta.content;

                  if (chunk.done) finalDoneChunk = chunk;
                } catch {
                  // skip broken json fragments
                }
              }
            }

            // Also check anything left in buffer
            if (buffer.trim()) {
              let jsonStr = buffer.trim();
              if (jsonStr.startsWith("data: ")) jsonStr = jsonStr.slice(6);
              if (jsonStr !== "[DONE]") {
                try {
                  const chunk = JSON.parse(jsonStr);
                  if (chunk.message?.content) fullText += chunk.message.content;
                  else if (chunk.response) fullText += chunk.response;
                  const delta = chunk.choices?.[0]?.delta;
                  if (delta?.content) fullText += delta.content;
                  if (chunk.done) finalDoneChunk = chunk;
                } catch {}
              }
            }

            logResponse(method, pathname, res.status, {
              status: "(stream_completed)",
              generated_text: fullText,
              metrics: finalDoneChunk ? {
                prompt_eval_count: finalDoneChunk.prompt_eval_count,
                eval_count: finalDoneChunk.eval_count,
              } : undefined
            });
          } catch (err) {
            logDebug("Error consuming stream for logging: " + String(err));
          }
        })();

        return new Response(streamForClient, { status: res.status, headers: res.headers });
      }

      return res;
    }

    if (method === "OPTIONS") {
      logDebug("CORS preflight → 204");
      return corsPreflightResponse();
    }

    if ((method === "GET" || method === "HEAD") && pathname === "/") {
      logResponse(method, pathname, 200, "Ollama is running");
      return withCors(
        new Response(method === "HEAD" ? null : "Ollama is running", {
          headers: { "Content-Type": "text/plain" },
        })
      );
    }

    if (pathname === "/v1/chat/completions" && method === "POST") {
      return handleAndLog(async () => {
        const targetPath = pathname.replace(/^\/v1/, "") + url.search;
        const targetUrl = LMSTUDIO_URL.replace(/\/$/, "") + targetPath;

        const headers = new Headers(req.headers);
        headers.delete("host");

        let bodyObj: any = null;
        try {
          if (requestBody) {
            // Deep clone so we don't mutate the logged version
            bodyObj = JSON.parse(JSON.stringify(requestBody));
          } else {
            bodyObj = await req.json();
          }
        } catch {}

        if (bodyObj) {
          // Normalize model name — strip any Ollama tag
          if (typeof bodyObj.model === "string") {
            bodyObj.model = stripTag(bodyObj.model);
          }

          headers.set("content-type", "application/json");
          headers.delete("content-length");
        }

        const finalBody = bodyObj ? JSON.stringify(bodyObj) : req.body;

        logDebug(`Proxying (with intercept) → ${targetUrl}`);

        try {
          const upstream = await fetch(targetUrl, {
            method,
            headers,
            body: finalBody,
          });

          logUpstream(targetUrl, method, upstream.status);

          const res = new Response(upstream.body, {
            status: upstream.status,
            statusText: upstream.statusText,
            headers: upstream.headers,
          });
          return withCors(res);
        } catch (err: any) {
          logUpstream(targetUrl, method, undefined, err.message);
          return errorResponse("LMStudio unreachable: " + err.message, 502);
        }
      });
    }

    if (pathname.startsWith("/v1/")) {
      const targetPath = pathname.replace(/^\/v1/, "") + url.search;
      const targetUrl = LMSTUDIO_URL.replace(/\/$/, "") + targetPath;

      const headers = new Headers(req.headers);
      headers.delete("host");

      logDebug(`Proxying → ${targetUrl}`);

      try {
        const upstream = await fetch(targetUrl, {
          method,
          headers,
          body: method !== "GET" && method !== "HEAD" ? req.body : undefined,
        });

        logUpstream(targetUrl, method, upstream.status);

        const res = new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers,
        });
        return withCors(res);
      } catch (err: any) {
        logUpstream(targetUrl, method, undefined, err.message);
        return errorResponse("LMStudio unreachable: " + err.message, 502);
      }
    }

    // GET /api/tags — list available models
    if ((method === "GET" || method === "HEAD") && pathname === "/api/tags") {
      return handleAndLog(() => handleTags());
    }

    // POST /api/chat — chat completions (streaming + non-streaming)
    if (method === "POST" && pathname === "/api/chat") {
      return handleAndLog(() => handleChat(req));
    }

    // POST /api/generate — text completions (streaming + non-streaming)
    if (method === "POST" && pathname === "/api/generate") {
      return handleAndLog(() => handleGenerate(req));
    }

    // POST /api/embed — embeddings, new multi-input format
    if (method === "POST" && pathname === "/api/embed") {
      return handleAndLog(() => handleEmbed(req, false));
    }

    // POST /api/embeddings — embeddings, legacy single-prompt format
    if (method === "POST" && pathname === "/api/embeddings") {
      return handleAndLog(() => handleEmbed(req, true));
    }

    // GET /api/version — bridge version
    if ((method === "GET" || method === "HEAD") && pathname === "/api/version") {
      return handleAndLog(() => handleVersion());
    }

    // GET /api/ps — list running / loaded models
    if ((method === "GET" || method === "HEAD") && pathname === "/api/ps") {
      return handleAndLog(() => handlePs());
    }

    // POST /api/show — model details
    if (method === "POST" && pathname === "/api/show") {
      return handleAndLog(() => handleShow(req));
    }

    if (pathname === "/api/copy") {
      return handleAndLog(() => handleNotSupported("POST /api/copy"));
    }
    if (pathname === "/api/delete") {
      return handleAndLog(() => handleNotSupported("DELETE /api/delete"));
    }
    if (pathname === "/api/pull") {
      return handleAndLog(() => handleNotSupported("POST /api/pull"));
    }
    if (pathname === "/api/push") {
      return handleAndLog(() => handleNotSupported("POST /api/push"));
    }
    if (pathname === "/api/create") {
      return handleAndLog(() => handleNotSupported("POST /api/create"));
    }
    if (pathname.startsWith("/api/blobs")) {
      return handleAndLog(() => handleNotSupported("POST /api/blobs"));
    }

    logResponse(method, pathname, 404, { error: "Not Found" });
    return errorResponse("Not Found", 404);
  },
});

console.log(`🌉 LMStudio → Ollama bridge running on http://localhost:${server.port}`);
console.log(`   Upstream LMStudio: ${LMSTUDIO_URL}`);
if (VERBOSE) {
  console.log(`   🔍 Verbose logging: ON`);
}
console.log(`   Press Ctrl+C to stop.`);
