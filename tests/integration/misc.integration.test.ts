import { describe, it, expect } from "bun:test";
import { startBridge, BRIDGE_URL, TEST_CHAT_MODEL } from "./setup.ts";

startBridge();

describe("[integration] GET /api/version", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/version`);
    expect(res.status).toBe(200);
  });

  it("returns a { version } JSON object", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/version`);
    const body = await res.json() as { version: string };
    expect(typeof body.version).toBe("string");
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe("[integration] GET /api/ps", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/ps`);
    expect(res.status).toBe(200);
  });

  it("returns a 'models' array", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/ps`);
    const body = await res.json() as { models: unknown[] };
    expect(Array.isArray(body.models)).toBe(true);
  });

  it("each model has ps-format fields", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/ps`);
    const body = await res.json() as { models: Array<Record<string, unknown>> };
    for (const m of body.models) {
      expect(typeof m.name).toBe("string");
      expect(typeof m.size_vram).toBe("number");
      expect(typeof m.expires_at).toBe("string");
    }
  });
});

describe("[integration] POST /api/show", () => {
  it("returns 200 for a known model", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL }),
    });
    expect(res.status).toBe(200);
  });

  it("returns Ollama show body shape", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.modelfile).toBe("string");
    expect(typeof body.template).toBe("string");
    expect(body).toHaveProperty("details");
    expect(body).toHaveProperty("model_info");
  });

  it("returns 404 for unknown model", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "this-model-does-not-exist:latest" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("[integration] Unsupported model management endpoints (501)", () => {
  const notSupportedCases: Array<[string, string, object?]> = [
    ["POST", "/api/copy", { source: "m", destination: "m2" }],
    ["DELETE", "/api/delete", { model: "m" }],
    ["POST", "/api/pull", { model: "m" }],
    ["POST", "/api/push", { model: "m" }],
    ["POST", "/api/create", { model: "m" }],
    ["POST", "/api/blobs/sha256:abc", {}],
  ];

  for (const [method, path, body] of notSupportedCases) {
    it(`${method} ${path} returns 501`, async () => {
      const res = await fetch(`${BRIDGE_URL}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      expect(res.status).toBe(501);
      const resBody = await res.json() as { error: string };
      expect(typeof resBody.error).toBe("string");
    });
  }
});

describe("[integration] Unknown route", () => {
  it("GET /api/bogus returns 404", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/bogus`);
    expect(res.status).toBe(404);
  });
});
