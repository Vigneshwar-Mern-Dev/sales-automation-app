type LogLevel = "debug" | "info" | "warn" | "error";

type LogFields = Record<string, unknown>;

function sanitizeFields(fields: LogFields = {}) {
  const sanitized: LogFields = {};

  for (const [key, value] of Object.entries(fields)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("token") ||
      lowerKey.includes("cookie")
    ) {
      sanitized[key] = "[redacted]";
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function write(level: LogLevel, message: string, fields?: LogFields) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...sanitizeFields(fields),
  };

  const serialized = JSON.stringify(entry);

  switch (level) {
    case "debug":
      if (process.env.NODE_ENV !== "production") {
        console.debug(serialized);
      }
      break;
    case "info":
      console.info(serialized);
      break;
    case "warn":
      console.warn(serialized);
      break;
    case "error":
      console.error(serialized);
      break;
  }
}

export const logger = {
  debug: (message: string, fields?: LogFields) => write("debug", message, fields),
  info: (message: string, fields?: LogFields) => write("info", message, fields),
  warn: (message: string, fields?: LogFields) => write("warn", message, fields),
  error: (message: string, fields?: LogFields) => write("error", message, fields),
};
