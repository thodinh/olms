import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleGenerate } from "../src/handlers/generate.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function makeReq(body: object): Request {
  return new Request("http://localhost/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeOpenAICompletion(text = "Once upon a time...", finish_reason = "stop") {
  return {
    choices: [{ text, finish_reason }],
    usage: { prompt_tokens: 8, completion_tokens: 20 },
  };
}

describe("POST /api/generate — handleGenerate() [non-streaming]", () => {
  it("sends correct OpenAI completions request", async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = mock(async (_url: string | Request | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(fakeOpenAICompletion()), { status: 200 });
    }) as unknown as typeof fetch;

    await handleGenerate(
      makeReq({
        model: "mistral",
        prompt: "Tell me a story",
        stream: false,
        options: { temperature: 1.0, top_p: 0.95 },
      }),
    );

    expect(capturedBody.model).toBe("mistral");
    expect(capturedBody.prompt).toBe("Tell me a story");
    expect(capturedBody.temperature).toBe(1.0);
    expect(capturedBody.top_p).toBe(0.95);
    expect(capturedBody.stream).toBe(false);
  });

  it("returns correct Ollama generate response shape", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(JSON.stringify(fakeOpenAICompletion("A dragon lived here.")), { status: 200 }),
      ),
    ) as unknown as typeof fetch;

    const res = await handleGenerate(makeReq({ model: "mistral", prompt: "...", stream: false }));
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.model).toBe("mistral");
    expect(body.response).toBe("A dragon lived here.");
    expect(body.done).toBe(true);
    expect(body.done_reason).toBe("stop");
    expect(typeof body.created_at).toBe("string");
    expect(body).toHaveProperty("prompt_eval_count");
    expect(body).toHaveProperty("eval_count");
  });

  it("returns 502 when upstream is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

    const res = await handleGenerate(makeReq({ model: "m", prompt: "hi", stream: false }));
    expect(res.status).toBe(502);
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Bad Gateway", { status: 502 })),
    ) as unknown as typeof fetch;

    const res = await handleGenerate(makeReq({ model: "m", prompt: "hi", stream: false }));
    expect(res.status).toBe(502);
  });

  it("returns 400 on invalid JSON", async () => {
    const req = new Request("http://localhost/api/generate", { method: "POST", body: "bad" });
    const res = await handleGenerate(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate — handleGenerate() [streaming]", () => {
  it("returns NDJSON stream with correct chunk shapes", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ text: "Once ", finish_reason: null }] })}`,
      `data: ${JSON.stringify({ choices: [{ text: "upon", finish_reason: null }] })}`,
      "data: [DONE]",
    ].join("\n");

    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(sseLines, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    ) as unknown as typeof fetch;

    const res = await handleGenerate(makeReq({ model: "mistral", prompt: "Tell me", stream: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    const chunks = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    const contentChunks = chunks.filter((c) => !c.done);
    expect(contentChunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of contentChunks) {
      expect(chunk.model).toBe("mistral");
      expect(chunk.done).toBe(false);
      expect(chunk).toHaveProperty("response");
    }

    const doneChunk = chunks[chunks.length - 1];
    expect(doneChunk.done).toBe(true);
  });
});
