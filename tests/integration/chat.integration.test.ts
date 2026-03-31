import { describe, it, expect } from "bun:test";
import { startBridge, BRIDGE_URL, TEST_CHAT_MODEL } from "./setup.ts";

startBridge();

const MESSAGES = [{ role: "user", content: "Reply with the single word: PONG" }];

describe("[integration] POST /api/chat — non-streaming", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL, messages: MESSAGES, stream: false }),
    });
    expect(res.status).toBe(200);
  });

  it("returns a valid Ollama chat response shape", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL, messages: MESSAGES, stream: false }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(body.model).toBe(TEST_CHAT_MODEL);
    expect(body.done).toBe(true);
    expect(typeof body.done_reason).toBe("string");
    expect(typeof body.created_at).toBe("string");
    expect(body).toHaveProperty("message");

    const message = body.message as Record<string, string>;
    expect(message.role).toBe("assistant");
    expect(typeof message.content).toBe("string");
    expect(message.content.length).toBeGreaterThan(0);
  });

  it("includes token usage fields", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL, messages: MESSAGES, stream: false }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.prompt_eval_count).toBe("number");
    expect(typeof body.eval_count).toBe("number");
  });

  it("respects options.temperature (smoke test — no error)", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        messages: MESSAGES,
        stream: false,
        options: { temperature: 0.1, num_predict: 20 },
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.done).toBe(true);
  });
});

describe("[integration] POST /api/chat — streaming", () => {
  it("returns HTTP 200 with application/x-ndjson content type", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: TEST_CHAT_MODEL, messages: MESSAGES, stream: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
  });

  it("emits valid NDJSON chunks and ends with done:true", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        messages: MESSAGES,
        stream: true,
        options: { num_predict: 30 },
      }),
    });

    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const chunks = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    // All intermediate chunks must have done:false and a message
    const midChunks = chunks.slice(0, -1);
    for (const chunk of midChunks) {
      expect(chunk.model).toBe(TEST_CHAT_MODEL);
      expect(chunk.done).toBe(false);
      expect(chunk).toHaveProperty("message");
    }

    // Final chunk must have done:true
    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.done).toBe(true);
    expect(typeof lastChunk.done_reason).toBe("string");
  });

  it("all chunks have model and created_at fields", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        messages: MESSAGES,
        stream: true,
        options: { num_predict: 20 },
      }),
    });
    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    for (const line of lines) {
      const chunk = JSON.parse(line) as Record<string, unknown>;
      expect(chunk.model).toBe(TEST_CHAT_MODEL);
      expect(typeof chunk.created_at).toBe("string");
    }
  });
});
