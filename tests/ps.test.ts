import { describe, it, expect, mock, afterEach } from "bun:test";
import { handlePs } from "../src/handlers/ps.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const FAKE_MODELS = {
  data: [
    { id: "llama3:8b", created: 1700000000, object: "model" },
    { id: "mistral:7b", created: 1710000000, object: "model" },
  ],
};

describe("GET /api/ps — handlePs()", () => {
  it("returns HTTP 200", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handlePs();
    expect(res.status).toBe(200);
  });

  it("returns a JSON body with a 'models' array", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handlePs();
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.models)).toBe(true);
    expect((body.models as unknown[]).length).toBe(2);
  });

  it("each model has Ollama ps-format fields", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handlePs();
    const body = await res.json() as { models: Array<Record<string, unknown>> };
    for (const m of body.models) {
      expect(typeof m.name).toBe("string");
      expect(typeof m.model).toBe("string");
      expect(typeof m.size).toBe("number");
      expect(typeof m.size_vram).toBe("number");
      expect(typeof m.expires_at).toBe("string");
      expect(m).toHaveProperty("details");
    }
  });

  it("returns 500 when LMStudio is unreachable", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;

    const res = await handlePs();
    expect(res.status).toBe(500);
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("", { status: 503 })),
    ) as unknown as typeof fetch;

    const res = await handlePs();
    expect(res.status).toBe(503);
  });
});
