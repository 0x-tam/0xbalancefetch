type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel(): LogLevel {
  const env = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
  return LEVELS[env] !== undefined ? env : "info";
}

function timestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel()];
}

function fmt(level: string, msg: string): string {
  return `[${timestamp()}] [${level.toUpperCase().padEnd(5)}] ${msg}`;
}

export const logger = {
  debug: (msg: string) => { if (shouldLog("debug")) console.debug(fmt("debug", msg)); },
  info:  (msg: string) => { if (shouldLog("info"))  console.info(fmt("info",  msg)); },
  warn:  (msg: string) => { if (shouldLog("warn"))  console.warn(fmt("warn",  msg)); },
  error: (msg: string) => { if (shouldLog("error")) console.error(fmt("error", msg)); },
};
