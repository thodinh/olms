import { parseArgs } from "util";

let args: { values: Record<string, string | boolean | undefined>; positionals: string[] } = { values: {}, positionals: [] };

try {
  args = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: { type: "string", short: "p" },
      "lmstudio-url": { type: "string", short: "u" },
      "ollama-version": { type: "string", short: "v" },
      "log-dir": { type: "string" },
      verbose: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
    strict: false,
    allowPositionals: true,
  });
} catch {
  // Ignore parse errors (e.g., during tests)
}

if (args.values.help) {
  console.log(`
Usage: olms [options]
       olms service <install|uninstall|start|stop|status>

Options:
  -p, --port <port>             Port to run the bridge on (default: 11434)
  -u, --lmstudio-url <url>      URL of the upstream LMStudio server (default: http://localhost:1234/v1)
  -v, --ollama-version <ver>    Ollama version to report to clients (default: 0.19.0)
      --log-dir <dir>           Directory to save daily log rotation files (e.g., ./logs)
      --verbose                 Enable verbose logging (request/response details)
  -h, --help                    Show this help message

Service Management:
  olms service install          Register as a background service (auto-start on login)
  olms service uninstall        Remove the background service
  olms service start            Start the service now
  olms service stop             Stop the service
  olms service status           Check if the service is running
`);
  process.exit(0);
}

export const LMSTUDIO_URL =
  (args.values["lmstudio-url"] as string | undefined) ??
  process.env.LMSTUDIO_URL ??
  "http://localhost:1234/v1";

export const PORT = parseInt(
  (args.values.port as string | undefined) ?? process.env.PORT ?? "11434",
  10
);

export const OLLAMA_VERSION =
  (args.values["ollama-version"] as string | undefined) ??
  process.env.OLLAMA_VERSION ??
  "0.19.0";

export const VERBOSE =
  args.values.verbose === true ||
  process.env.VERBOSE === "1" ||
  process.env.VERBOSE === "true";

export const LOG_DIR =
  (args.values["log-dir"] as string | undefined) ??
  process.env.LOG_DIR;

export const POSITIONAL_ARGS = args.positionals;

