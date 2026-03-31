import { describe, it, expect } from "bun:test";
import { startBridge, BRIDGE_URL } from "./setup.ts";

startBridge();

describe("[integration] GET /api/tags", () => {
  it("returns HTTP 200", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/tags`);
    expect(res.status).toBe(200);
  });

  it("returns a JSON body with a 'models' array", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/tags`);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty("models");
    expect(Array.isArray(body.models)).toBe(true);
  });

  it("each model has the required Ollama fields", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/tags`);
    const body = await res.json() as { models: Array<Record<string, unknown>> };
    expect(body.models.length).toBeGreaterThan(0);

    for (const model of body.models) {
      expect(typeof model.name).toBe("string");
      expect(typeof model.model).toBe("string");
      expect(typeof model.modified_at).toBe("string");
      expect(typeof model.size).toBe("number");
      expect(model).toHaveProperty("details");
    }
  });

  it("model names are non-empty strings", async () => {
    const res = await fetch(`${BRIDGE_URL}/api/tags`);
    const body = await res.json() as { models: Array<{ name: string }> };
    for (const model of body.models) {
      expect(model.name.length).toBeGreaterThan(0);
    }
  });
});
