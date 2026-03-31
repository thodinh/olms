import { describe, it, expect } from "bun:test";
import { startBridge, BRIDGE_URL, TEST_EMBED_MODEL } from "./setup.ts";

startBridge();

describe("[integration] POST /api/embed (new format)", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, input: "Hello world" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns { model, embeddings: float[][] } for a single string", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, input: "Hello world" }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(body.model).toBe(TEST_EMBED_MODEL);
    expect(Array.isArray(body.embeddings)).toBe(true);
    const embeddings = body.embeddings as number[][];
    expect(embeddings.length).toBe(1);
    expect(Array.isArray(embeddings[0])).toBe(true);
    expect(embeddings[0].length).toBeGreaterThan(0);
    // All values should be numbers
    for (const v of embeddings[0]) {
      expect(typeof v).toBe("number");
    }
  });

  it("returns multiple embeddings for array input", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, input: ["Hello", "World"] }),
    });
    const body = await res.json() as Record<string, unknown>;
    const embeddings = body.embeddings as number[][];

    expect(embeddings.length).toBe(2);
    expect(embeddings[0].length).toBeGreaterThan(0);
    expect(embeddings[1].length).toBeGreaterThan(0);
    // Two different inputs should produce two different vectors
    expect(embeddings[0]).not.toEqual(embeddings[1]);
  });

  it("all embeddings have the same dimension", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_EMBED_MODEL,
        input: ["Hello", "World", "Bun is fast"],
      }),
    });
    const body = await res.json() as { embeddings: number[][] };
    const dims = body.embeddings.map((e) => e.length);
    expect(new Set(dims).size).toBe(1); // all same dimension
  });
});

describe("[integration] POST /api/embeddings (legacy format)", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, prompt: "Hello world" }),
    });
    expect(res.status).toBe(200);
  });

  it("returns { embedding: float[] } (legacy single embedding)", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_EMBED_MODEL, prompt: "Hello world" }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(body).toHaveProperty("embedding");
    expect(body).not.toHaveProperty("embeddings"); // must NOT use new format
    const embedding = body.embedding as number[];
    expect(Array.isArray(embedding)).toBe(true);
    expect(embedding.length).toBeGreaterThan(0);
    for (const v of embedding) {
      expect(typeof v).toBe("number");
    }
  });

  it("new /api/embed and legacy /api/embeddings produce the same vector for the same input", async () => {
    const input = "Consistency check";

    const [newRes, legacyRes] = await Promise.all([
      fetch(`${BRIDGE_URL}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: TEST_EMBED_MODEL, input }),
      }),
      fetch(`${BRIDGE_URL}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: TEST_EMBED_MODEL, prompt: input }),
      }),
    ]);

    const newBody = await newRes.json() as { embeddings: number[][] };
    const legacyBody = await legacyRes.json() as { embedding: number[] };

    expect(newBody.embeddings[0]).toEqual(legacyBody.embedding);
  });
});
