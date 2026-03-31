import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleShow } from "../src/handlers/show.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const FAKE_MODELS = {
  data: [
    { id: "llama3:8b", created: 1700000000, object: "model", owned_by: "user" },
  ],
};

function makeReq(body: object): Request {
  return new Request("http://localhost/api/show", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/show — handleShow()", () => {
  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/show", { method: "POST", body: "bad" });
    const res = await handleShow(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when model field is missing", async () => {
    const res = await handleShow(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when model is not found in LMStudio", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleShow(makeReq({ model: "nonexistent-model" }));
    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toContain("not found");
  });

  it("returns 200 with show body for a known model", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleShow(makeReq({ model: "llama3:8b" }));
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.modelfile).toBe("string");
    expect(typeof body.template).toBe("string");
    expect(body).toHaveProperty("details");
    expect(body).toHaveProperty("model_info");
    expect(typeof body.modified_at).toBe("string");
  });

  it("modelfile contains the model name", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(FAKE_MODELS), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleShow(makeReq({ model: "llama3:8b" }));
    const body = await res.json() as { modelfile: string };
    expect(body.modelfile).toContain("llama3:8b");
  });

  it("returns 500 when LMStudio is unreachable", async () => {
    globalThis.fetch = mock(() =>
      Promise.reject(new Error("ECONNREFUSED")),
    ) as unknown as typeof fetch;

    const res = await handleShow(makeReq({ model: "llama3:8b" }));
    expect(res.status).toBe(500);
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("", { status: 502 })),
    ) as unknown as typeof fetch;

    const res = await handleShow(makeReq({ model: "llama3:8b" }));
    expect(res.status).toBe(502);
  });
});
