import pino from "pino";

/**
 * Create and configure a Pino logger instance
 */
export function createLogger(level: string = "info", pretty: boolean = true) {
  if (pretty) {
    return pino({
      level,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      },
    });
  }

  // Production logger (JSON format)
  return pino({
    level,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}

// Default logger instance
export const logger = createLogger(
  process.env.LOG_LEVEL || "info",
  process.env.NODE_ENV !== "production"
);