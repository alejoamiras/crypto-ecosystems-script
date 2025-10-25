import pino from "pino";
import * as fs from "fs";
import * as path from "path";

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

/**
 * Create a logger that writes to both console and file using pino transports
 */
export function createFileLogger(
  logFile?: string,
  level: string = "info",
  pretty: boolean = true
) {
  // If no logFile specified, just return regular logger
  if (!logFile) {
    return createLogger(level, pretty);
  }

  // Ensure logs directory exists
  const logDir = path.dirname(logFile);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }

  // Use pino with multiple transports
  return pino({
    level,
    transport: {
      targets: [
        // Console output with pretty printing
        {
          target: pretty ? 'pino-pretty' : 'pino/file',
          options: pretty ? {
            destination: 1, // stdout
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          } : {
            destination: 1 // stdout
          },
          level
        },
        // File output (always JSON)
        {
          target: 'pino/file',
          options: { destination: logFile },
          level
        }
      ]
    }
  });
}

// Default logger instance
export const logger = createLogger(
  process.env.LOG_LEVEL || "info",
  process.env.NODE_ENV !== "production"
);