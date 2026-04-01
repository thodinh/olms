import { describe, it, expect } from "bun:test";
import { handleVersion } from "../src/handlers/version.ts";
import { OLLAMA_VERSION } from "../src/config.ts";

describe("GET /api/version — handleVersion()", () => {
  it("returns HTTP 200", async () => {
    const res = handleVersion();
    expect(res.status).toBe(200);
  });

  it("returns a JSON body with a 'version' string", async () => {
    const res = handleVersion();
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.version).toBe("string");
    expect((body.version as string).length).toBeGreaterThan(0);
  });

  it("version looks like a semver string and matches configuration", async () => {
    const res = handleVersion();
    const body = await res.json() as { version: string };
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.version).toBe(OLLAMA_VERSION);
  });

  it("includes CORS headers", async () => {
    const res = handleVersion();
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
