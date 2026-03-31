import { describe, it, expect } from "bun:test";
import { handleNotSupported } from "../src/handlers/notSupported.ts";

describe("handleNotSupported()", () => {
  it("returns HTTP 501", async () => {
    const res = handleNotSupported("POST /api/pull");
    expect(res.status).toBe(501);
  });

  it("returns JSON with an error field", async () => {
    const res = handleNotSupported("DELETE /api/delete");
    const body = await res.json() as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("error message contains the endpoint name", async () => {
    const res = handleNotSupported("POST /api/copy");
    const body = await res.json() as { error: string };
    expect(body.error).toContain("POST /api/copy");
  });

  it("includes CORS headers", async () => {
    const res = handleNotSupported("POST /api/push");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
