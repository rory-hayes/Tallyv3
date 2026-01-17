import "server-only";

type LogLevel = "info" | "warn" | "error";

type LogContext = {
  firmId?: string;
  userId?: string;
  payRunId?: string;
  importId?: string;
  packId?: string;
  runId?: string;
  jobId?: string;
  jobName?: string;
  status?: string;
  attempt?: number;
  durationMs?: number;
  packVersion?: number;
  errorName?: string;
};

const allowedKeys = new Set<keyof LogContext>([
  "firmId",
  "userId",
  "payRunId",
  "importId",
  "packId",
  "runId",
  "jobId",
  "jobName",
  "status",
  "attempt",
  "durationMs",
  "packVersion",
  "errorName"
]);

const sanitizeContext = (context?: LogContext): Record<string, string | number | boolean> => {
  if (!context) {
    return {};
  }

  const sanitized: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!allowedKeys.has(key as keyof LogContext) || value === undefined || value === null) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    }
  }

  return sanitized;
};

const writeLog = (level: LogLevel, event: string, context?: LogContext) => {
  const payload = {
    level,
    event,
    timestamp: new Date().toISOString(),
    ...sanitizeContext(context)
  };
  const line = `${JSON.stringify(payload)}\n`;
  const stream = level === "error" ? process.stderr : process.stdout;
  stream.write(line);
};

export const logInfo = (event: string, context?: LogContext) =>
  writeLog("info", event, context);

export const logWarn = (event: string, context?: LogContext) =>
  writeLog("warn", event, context);

export const logError = (event: string, context?: LogContext) =>
  writeLog("error", event, context);

const formatErrorName = (error: unknown): string => {
  if (error instanceof Error && error.name) {
    return error.name;
  }
  return "Error";
};

export const startSpan = (event: string, context?: LogContext) => {
  const startedAt = Date.now();
  logInfo(`${event}_STARTED`, context);

  return {
    end: (extra?: LogContext) => {
      logInfo(`${event}_COMPLETED`, {
        ...context,
        ...extra,
        durationMs: Date.now() - startedAt
      });
    },
    fail: (error: unknown, extra?: LogContext) => {
      logError(`${event}_FAILED`, {
        ...context,
        ...extra,
        durationMs: Date.now() - startedAt,
        errorName: formatErrorName(error)
      });
    }
  };
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: {
    attempts?: number;
    delayMs?: number;
    event: string;
    context?: LogContext;
  }
): Promise<T> => {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 200;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      logInfo(`${options.event}_ATTEMPT`, {
        ...options.context,
        attempt
      });
      return await operation();
    } catch (error) {
      const isLast = attempt === attempts;
      const log = isLast ? logError : logWarn;
      log(`${options.event}_FAILED`, {
        ...options.context,
        attempt,
        errorName: formatErrorName(error)
      });

      if (isLast) {
        throw error;
      }

      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw new Error("Retry attempts exhausted.");
};
