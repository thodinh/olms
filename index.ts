#!/usr/bin/env bun
// index.ts — Main entry point
// Routes incoming Ollama API requests to the appropriate handler.

import { PORT } from "./src/config.ts";
import { corsPreflightResponse, errorResponse } from "./src/utils/cors.ts";
import { handleTags } from "./src/handlers/tags.ts";
import { handleChat } from "./src/handlers/chat.ts";
import { handleGenerate } from "./src/handlers/generate.ts";
import { handleEmbed } from "./src/handlers/embed.ts";
import { handleVersion } from "./src/handlers/version.ts";
import { handlePs } from "./src/handlers/ps.ts";
import { handleShow } from "./src/handlers/show.ts";
import { handleNotSupported } from "./src/handlers/notSupported.ts";

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { method, pathname } = { method: req.method, pathname: url.pathname };

    console.log(`[${new Date().toISOString()}] ${method} ${pathname}`);

    // CORS preflight
    if (method === "OPTIONS") {
      return corsPreflightResponse();
    }

    // ── Inference ────────────────────────────────────────────────────────────

    // GET /api/tags — list available models
    if (method === "GET" && pathname === "/api/tags") {
      return handleTags();
    }

    // POST /api/chat — chat completions (streaming + non-streaming)
    if (method === "POST" && pathname === "/api/chat") {
      return handleChat(req);
    }

    // POST /api/generate — text completions (streaming + non-streaming)
    if (method === "POST" && pathname === "/api/generate") {
      return handleGenerate(req);
    }

    // POST /api/embed — embeddings, new multi-input format
    if (method === "POST" && pathname === "/api/embed") {
      return handleEmbed(req, false);
    }

    // POST /api/embeddings — embeddings, legacy single-prompt format
    if (method === "POST" && pathname === "/api/embeddings") {
      return handleEmbed(req, true);
    }

    // ── Model info ───────────────────────────────────────────────────────────

    // GET /api/version — bridge version
    if (method === "GET" && pathname === "/api/version") {
      return handleVersion();
    }

    // GET /api/ps — list running / loaded models
    if (method === "GET" && pathname === "/api/ps") {
      return handlePs();
    }

    // POST /api/show — model details
    if (method === "POST" && pathname === "/api/show") {
      return handleShow(req);
    }

    // ── Model management (not possible via LMStudio API → 501) ───────────────

    if (pathname === "/api/copy") {
      return handleNotSupported("POST /api/copy");
    }
    if (pathname === "/api/delete") {
      return handleNotSupported("DELETE /api/delete");
    }
    if (pathname === "/api/pull") {
      return handleNotSupported("POST /api/pull");
    }
    if (pathname === "/api/push") {
      return handleNotSupported("POST /api/push");
    }
    if (pathname === "/api/create") {
      return handleNotSupported("POST /api/create");
    }
    if (pathname.startsWith("/api/blobs")) {
      return handleNotSupported("POST /api/blobs");
    }

    return errorResponse("Not Found", 404);
  },
});

console.log(`🌉 LMStudio → Ollama bridge running on http://localhost:${server.port}`);
console.log(`   Upstream LMStudio: ${process.env.LMSTUDIO_URL ?? "http://localhost:1234/v1"}`);
console.log(`   Press Ctrl+C to stop.`);
