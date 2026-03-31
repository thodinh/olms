import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleEmbed } from "../src/handlers/embed.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const FAKE_EMBEDDING_1 = [0.1, 0.2, 0.3];
const FAKE_EMBEDDING_2 = [0.4, 0.5, 0.6];

function fakeOpenAIEmbeddings(embeddings: number[][]) {
  return {
    data: embeddings.map((embedding, index) => ({ index, embedding, object: "embedding" })),
    usage: { prompt_tokens: 5 },
  };
}

function makeReq(path: string, body: object): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/embeddings (legacy) — handleEmbed(req, true)", () => {
  it("returns { embedding: float[] } for single prompt", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(fakeOpenAIEmbeddings([FAKE_EMBEDDING_1])), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    const req = makeReq("/api/embeddings", { model: "nomic", prompt: "Hello world" });
    const res = await handleEmbed(req, true);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("embedding");
    expect(body.embedding).toEqual(FAKE_EMBEDDING_1);
    expect(body).not.toHaveProperty("embeddings");
  });

  it("sends the prompt as a single-element array to OpenAI", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string | Request | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(fakeOpenAIEmbeddings([FAKE_EMBEDDING_1])), { status: 200 });
    }) as unknown as typeof fetch;

    await handleEmbed(makeReq("/api/embeddings", { model: "nomic", prompt: "test" }), true);
    expect(Array.isArray(capturedBody.input)).toBe(true);
    expect((capturedBody.input as string[])[0]).toBe("test");
  });

  it("returns 502 when upstream is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

    const res = await handleEmbed(makeReq("/api/embeddings", { model: "m", prompt: "x" }), true);
    expect(res.status).toBe(502);
  });
});

describe("POST /api/embed (new) — handleEmbed(req, false)", () => {
  it("returns { embeddings: float[][] } for a single string input", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(fakeOpenAIEmbeddings([FAKE_EMBEDDING_1])), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    const req = makeReq("/api/embed", { model: "nomic", input: "Hello" });
    const res = await handleEmbed(req, false);
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("embeddings");
    expect(body.embeddings).toEqual([FAKE_EMBEDDING_1]);
    expect(body.model).toBe("nomic");
  });

  it("returns multiple embeddings for array input", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify(fakeOpenAIEmbeddings([FAKE_EMBEDDING_1, FAKE_EMBEDDING_2])),
          { status: 200 },
        ),
      ),
    ) as unknown as typeof fetch;

    const req = makeReq("/api/embed", { model: "nomic", input: ["Hello", "World"] });
    const res = await handleEmbed(req, false);

    const body = await res.json() as Record<string, unknown>;
    expect((body.embeddings as unknown[][]).length).toBe(2);
    expect((body.embeddings as number[][])[0]).toEqual(FAKE_EMBEDDING_1);
    expect((body.embeddings as number[][])[1]).toEqual(FAKE_EMBEDDING_2);
  });

  it("sends all inputs to OpenAI upstream", async () => {
    let capturedBody: Record<string, unknown> = {};
    globalThis.fetch = mock(async (_url: string | Request | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify(fakeOpenAIEmbeddings([FAKE_EMBEDDING_1, FAKE_EMBEDDING_2])),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await handleEmbed(makeReq("/api/embed", { model: "nomic", input: ["a", "b"] }), false);
    expect(capturedBody.input).toEqual(["a", "b"]);
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/embed", { method: "POST", body: "bad" });
    const res = await handleEmbed(req, false);
    expect(res.status).toBe(400);
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 })),
    ) as unknown as typeof fetch;

    const res = await handleEmbed(makeReq("/api/embed", { model: "m", input: "x" }), false);
    expect(res.status).toBe(404);
  });
});
