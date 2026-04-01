import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { handleTags } from "../src/handlers/tags.ts";

const originalFetch = globalThis.fetch;

beforeEach(() => { });
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("GET /api/tags — handleTags()", () => {
  it("returns correctly shaped Ollama model list", async () => {
    const fakeModels = {
      data: [
        { id: "llama3:8b", created: 1700000000, object: "model", owned_by: "user" },
        { id: "mistral:7b", created: 1710000000, object: "model", owned_by: "user" },
      ],
    };
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeModels), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleTags();
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("models");
    const models = body.models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(2);

    const first = models[0];
    expect(first.name).toBe("llama3:8b");
    expect(first.model).toBe("llama3:8b");
    expect(typeof first.modified_at).toBe("string");
    expect(first.size).toBe(6594474711);
    expect(first.digest).toBe("a6990ed6be41e15fac268393b3f2cf19e23f009e46a788bbdc7ac981cedd918b");
    expect((first.details as any).parent_model).toBe("");
    expect((first.details as any).family).toBe("llama");
    expect((first.details as any).families).toEqual(["llama"]);
  });

  it("handles an empty model list", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleTags();
    const body = await res.json() as Record<string, unknown>;
    expect((body.models as unknown[]).length).toBe(0);
  });

  it("returns 500 when LMStudio is unreachable", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;

    const res = await handleTags();
    expect(res.status).toBe(500);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("error");
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Service Unavailable", { status: 503 })),
    ) as unknown as typeof fetch;

    const res = await handleTags();
    expect(res.status).toBe(503);
  });
});
