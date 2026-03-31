import { parseArgs } from "util";

let args: { values: Record<string, string | boolean | undefined> } = { values: {} };

try {
  args = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      port: { type: "string", short: "p" },
      "lmstudio-url": { type: "string", short: "u" },
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

Options:
  -p, --port <port>             Port to run the bridge on (default: 11434)
  -u, --lmstudio-url <url>      URL of the upstream LMStudio server (default: http://localhost:1234/v1)
  -h, --help                    Show this help message
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
