import { describe, it, expect, mock, afterEach } from "bun:test";
import { handleChat } from "../src/handlers/chat.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function makeReq(body: object): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeOpenAIChat(content = "Hello!", finish_reason = "stop") {
  return {
    choices: [{ message: { role: "assistant", content }, finish_reason }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };
}

describe("POST /api/chat — handleChat() [non-streaming]", () => {
  it("maps Ollama request to OpenAI request correctly", async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = mock(async (_url: string | Request | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(fakeOpenAIChat()), { status: 200 });
    }) as unknown as typeof fetch;

    await handleChat(
      makeReq({
        model: "llama3",
        messages: [{ role: "user", content: "Hi" }],
        stream: false,
        options: { temperature: 0.5, num_predict: 200 },
      }),
    );

    expect(capturedBody.model).toBe("llama3");
    expect(capturedBody.messages).toEqual([{ role: "user", content: "Hi" }]);
    expect(capturedBody.temperature).toBe(0.5);
    expect(capturedBody.max_tokens).toBe(200);
    expect(capturedBody.stream).toBe(false);
  });

  it("returns correct Ollama-shaped response", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(fakeOpenAIChat("Sure thing!")), { status: 200 })),
    ) as unknown as typeof fetch;

    const res = await handleChat(makeReq({ model: "llama3", messages: [], stream: false }));
    expect(res.status).toBe(200);

    const body = await res.json() as Record<string, unknown>;
    expect(body.model).toBe("llama3");
    expect(body.done).toBe(true);
    expect(body.done_reason).toBe("stop");
    expect((body.message as Record<string, string>).content).toBe("Sure thing!");
    expect(typeof body.created_at).toBe("string");
    expect(body).toHaveProperty("prompt_eval_count");
    expect(body).toHaveProperty("eval_count");
  });

  it("returns 502 when LMStudio is unreachable", async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error("ECONNREFUSED"))) as unknown as typeof fetch;

    const res = await handleChat(makeReq({ model: "m", messages: [], stream: false }));
    expect(res.status).toBe(502);
  });

  it("propagates upstream error status", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(new Response("Internal error", { status: 500 })),
    ) as unknown as typeof fetch;

    const res = await handleChat(makeReq({ model: "m", messages: [], stream: false }));
    expect(res.status).toBe(500);
  });

  it("returns 400 on invalid JSON body", async () => {
    const req = new Request("http://localhost/api/chat", {
      method: "POST",
      body: "not-json",
    });
    const res = await handleChat(req);
    expect(res.status).toBe(400);
  });

  it("strips any tag from model name before forwarding", async () => {
    let capturedBody: Record<string, unknown> = {};

    globalThis.fetch = mock(async (_url: string | Request | URL, init?: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify(fakeOpenAIChat()), { status: 200 });
    }) as unknown as typeof fetch;

    // :latest
    await handleChat(makeReq({ model: "qwen3-coder:latest", messages: [], stream: false }));
    expect(capturedBody.model).toBe("qwen3-coder");

    // :8b  
    await handleChat(makeReq({ model: "llama3:8b", messages: [], stream: false }));
    expect(capturedBody.model).toBe("llama3");

    // no tag — should stay unchanged
    await handleChat(makeReq({ model: "qwen3.5-4b-mlx", messages: [], stream: false }));
    expect(capturedBody.model).toBe("qwen3.5-4b-mlx");
  });
});

describe("POST /api/chat — handleChat() [streaming]", () => {
  it("returns NDJSON stream with correct chunk shapes", async () => {
    const sseLines = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" }, finish_reason: null }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { content: " there" }, finish_reason: null }] })}`,
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

    const res = await handleChat(makeReq({ model: "llama3", messages: [], stream: true }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");

    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    const chunks = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    const contentChunks = chunks.filter((c) => !c.done);
    expect(contentChunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of contentChunks) {
      expect(chunk.model).toBe("llama3");
      expect(chunk.done).toBe(false);
      expect(chunk).toHaveProperty("message");
    }

    const doneChunk = chunks[chunks.length - 1];
    expect(doneChunk.done).toBe(true);
  });
});
