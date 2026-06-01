export type LogLevel = "silent" | "error" | "warn" | "info" | "debug";

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

const LEVEL_ORDER: Record<Exclude<LogLevel, "silent">, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function normalizeLevel(level: LogLevel): Exclude<LogLevel, "silent"> | "silent" {
  return level;
}

function shouldLog(current: LogLevel, wanted: Exclude<LogLevel, "silent">): boolean {
  if (current === "silent") return false;
  return LEVEL_ORDER[wanted] <= LEVEL_ORDER[current];
}

function write(level: Exclude<LogLevel, "silent">, message: string): void {
  process.stderr.write(`[${level.toUpperCase()}] ${message}\n`);
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const parts = [error.name ? `${error.name}:` : "", error.message || "unknown error"].filter(Boolean);
    const cause = (error as Error & { cause?: unknown }).cause;
    if (cause !== undefined && cause !== null) {
      parts.push(`cause=${describeError(cause)}`);
    }
    const code = (error as Error & { code?: unknown }).code;
    if (code !== undefined && code !== null) {
      parts.push(`code=${String(code)}`);
    }
    return parts.join(" ");
  }
  return String(error);
}

export function createLogger(level: LogLevel): Logger {
  const current = normalizeLevel(level);

  return {
    debug(message: string) {
      if (shouldLog(current, "debug")) write("debug", message);
    },
    info(message: string) {
      if (shouldLog(current, "info")) write("info", message);
    },
    warn(message: string) {
      if (shouldLog(current, "warn")) write("warn", message);
    },
    error(message: string) {
      if (shouldLog(current, "error")) write("error", message);
    },
  };
}
