import { beforeAll, afterAll, test, expect, describe } from "bun:test";
import { spawn } from "bun";

describe("CLI Binary Integration", () => {
  let serverProcess: ReturnType<typeof spawn> | null = null;
  const binaryPath = "./dist/olms";

  beforeAll(async () => {
    const buildProc = spawn(["bun", "run", "build"], {
      stdout: "ignore",
      stderr: "ignore",
    });

    const exitCode = await buildProc.exited;
    if (exitCode !== 0) {
      throw new Error(`Failed to build binary. Exit code: ${exitCode}`);
    }
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  test("olms --help prints usage and exits 0", async () => {
    const proc = spawn([binaryPath, "--help"], { stdout: "pipe" });
    const text = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(text).toContain("Usage: olms [options]");
    expect(text).toContain("--port");
    expect(text).toContain("--lmstudio-url");
  });

  test("olms starts on a custom port and version via CLI argument", async () => {
    const testPort = 19999;
    const testVersion = "0.99.99";

    serverProcess = spawn([binaryPath, "-p", testPort.toString(), "-v", testVersion], {
      stdout: "pipe",
      stderr: "pipe",
    });

    await new Promise((resolve) => setTimeout(resolve, 800));

    try {
      const res = await fetch(`http://localhost:${testPort}/api/version`);
      expect(res.status).toBe(200);

      const body = await res.json() as Record<string, string>;
      expect(body).toHaveProperty("version");
      expect(body.version).toBe(testVersion);
    } finally {
      serverProcess.kill();
      serverProcess = null;
    }
  });
});
