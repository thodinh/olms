import { describe, it, expect } from "bun:test";
import { startBridge, BRIDGE_URL, TEST_CHAT_MODEL } from "./setup.ts";

startBridge();

const PROMPT = "The capital of France is";

describe("[integration] POST /api/generate — non-streaming", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: false,
        options: { num_predict: 10 },
      }),
    });
    expect(res.status).toBe(200);
  });

  it("returns valid Ollama generate response shape", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: false,
        options: { num_predict: 10 },
      }),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(body.model).toBe(TEST_CHAT_MODEL);
    expect(body.done).toBe(true);
    expect(typeof body.done_reason).toBe("string");
    expect(typeof body.created_at).toBe("string");
    expect(typeof body.response).toBe("string");
    expect((body.response as string).length).toBeGreaterThan(0);
  });

  it("includes token usage fields", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: false,
        options: { num_predict: 10 },
      }),
    });
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.prompt_eval_count).toBe("number");
    expect(typeof body.eval_count).toBe("number");
  });

  it("respects options (temperature, num_predict) without error", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: false,
        options: { temperature: 0.0, num_predict: 5, seed: 42 },
      }),
    });
    expect(res.status).toBe(200);
  });
});

describe("[integration] POST /api/generate — streaming", () => {
  it("returns HTTP 200 with application/x-ndjson content type", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: true,
        options: { num_predict: 15 },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/x-ndjson");
  });

  it("emits valid NDJSON chunks and ends with done:true", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TEST_CHAT_MODEL,
        prompt: PROMPT,
        stream: true,
        options: { num_predict: 15 },
      }),
    });

    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);

    const chunks = lines.map((l) => JSON.parse(l) as Record<string, unknown>);

    const midChunks = chunks.slice(0, -1);
    for (const chunk of midChunks) {
      expect(chunk.model).toBe(TEST_CHAT_MODEL);
      expect(chunk.done).toBe(false);
      expect(chunk).toHaveProperty("response");
    }

    const lastChunk = chunks[chunks.length - 1];
    expect(lastChunk.done).toBe(true);
  });
});
