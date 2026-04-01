import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { VERBOSE, LOG_DIR } from "../config.ts";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
};

// ANSI strip regex
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.printf(({ message }) => {
      return message as string;
    }),
  }),
];

if (LOG_DIR) {
  transports.push(
    new DailyRotateFile({
      dirname: LOG_DIR,
      filename: "olms-%DATE%.log",
      datePattern: "YYYY-MM-DD",
      zippedArchive: true, // Automate zip rotation
      maxFiles: "7d",      // Keep logs for 7 days
      format: winston.format.combine(
        winston.format.printf(({ message }) => {
          return (message as string).replace(ANSI_REGEX, "");
        })
      ),
    })
  );
}

const logger = winston.createLogger({ transports });

function truncate(str: string, max = 100): string {
  if (typeof str !== "string") return str;
  if (str.length <= max) return str;
  return str.slice(0, max) + `... [${str.length - max} more chars]`;
}

function sanitizeBodyForLog(body: unknown): unknown {
  if (typeof body !== "object" || body === null) return body;

  try {
    const clone = JSON.parse(JSON.stringify(body)) as Record<string, any>;

    if (Array.isArray(clone.messages)) {
      clone.messages = clone.messages.map((m: any) => {
        if (m && typeof m.content === "string") {
          return { ...m, content: truncate(m.content, 100) };
        }
        return m;
      });
    }

    if (typeof clone.prompt === "string") {
      clone.prompt = truncate(clone.prompt, 100);
    }

    if (typeof clone.generated_text === "string") {
      clone.generated_text = truncate(clone.generated_text, 100);
    }

    if (Array.isArray(clone.context)) {
      if (clone.context.length > 20) {
        clone.context = [...clone.context.slice(0, 5), `... [${clone.context.length - 5} tokens omitted]`];
      }
    }

    return clone;
  } catch {
    return body;
  }
}

function timestamp(): string {
  return `${COLORS.dim}[${new Date().toISOString()}]${COLORS.reset}`;
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":    return COLORS.green;
    case "POST":   return COLORS.cyan;
    case "DELETE": return COLORS.red;
    case "PUT":
    case "PATCH":  return COLORS.yellow;
    default:       return COLORS.reset;
  }
}

function statusColor(status: number): string {
  if (status < 300) return COLORS.green;
  if (status < 400) return COLORS.yellow;
  return COLORS.red;
}

export function logRequest(method: string, pathname: string, body?: unknown): void {
  const mc = methodColor(method);
  logger.info(`${timestamp()} ${mc}${method}${COLORS.reset} ${pathname}`);

  if (VERBOSE && body !== undefined) {
    const sanitized = sanitizeBodyForLog(body);
    const bodyStr = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized, null, 2);
    logger.info(`${COLORS.magenta}  ▶ Request Body:${COLORS.reset}`);
    logger.info(`${COLORS.dim}  ${bodyStr}${COLORS.reset}`);
  }
}

export function logResponse(method: string, pathname: string, status: number, body?: unknown): void {
  if (!VERBOSE) return;

  const sc = statusColor(status);
  logger.info(`${timestamp()} ${sc}  ◀ ${status}${COLORS.reset} ${method} ${pathname}`);

  if (body !== undefined) {
    const sanitized = sanitizeBodyForLog(body);
    const bodyStr = typeof sanitized === "string" ? sanitized : JSON.stringify(sanitized, null, 2);
    logger.info(`${COLORS.blue}  ◀ Response Body:${COLORS.reset}`);
    logger.info(`${COLORS.dim}  ${bodyStr}${COLORS.reset}`);
  }
}

export function logUpstream(url: string, method: string, status?: number, error?: string): void {
  if (!VERBOSE) return;

  if (error) {
    logger.info(`${timestamp()} ${COLORS.red}  ⇡ UPSTREAM ERROR${COLORS.reset} ${method} ${url}`);
    logger.info(`${COLORS.red}    ${error}${COLORS.reset}`);
  } else if (status !== undefined) {
    const sc = statusColor(status);
    logger.info(`${timestamp()} ${sc}  ⇡ UPSTREAM ${status}${COLORS.reset} ${method} ${url}`);
  }
}

export function logDebug(message: string): void {
  if (!VERBOSE) return;
  logger.info(`${timestamp()} ${COLORS.dim}  ℹ ${message}${COLORS.reset}`);
}
