/**
 * Structured logger with PII masking and request correlation
 */

import type { HonoVariables } from "../types/env";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

/**
 * Mask sensitive data in logs (PII protection)
 */
export const maskSensitiveData = (data: unknown): unknown => {
  if (typeof data === "string") {
    // Mask email
    if (data.includes("@")) {
      const [local, domain] = data.split("@");
      return `${local.substring(0, 2)}***@${domain}`;
    }
    // Mask phone (E.164 format)
    if (data.match(/^\+?[1-9]\d{1,14}$/)) {
      return `${data.substring(0, 4)}******${data.substring(data.length - 2)}`;
    }
    // Mask password-like fields
    if (data.length > 8 && data.length < 100) {
      return "***";
    }
    return data;
  }

  if (typeof data === "object" && data !== null) {
    if (Array.isArray(data)) {
      return data.map(maskSensitiveData);
    }

    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();
      // Mask known sensitive fields
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("token") ||
        lowerKey.includes("key") ||
        lowerKey.includes("apikey")
      ) {
        masked[key] = "***";
      } else if (
        lowerKey.includes("email") ||
        lowerKey.includes("phone") ||
        lowerKey.includes("whatsapp")
      ) {
        masked[key] = maskSensitiveData(value);
      } else {
        masked[key] = value;
      }
    }
    return masked;
  }

  return data;
};

/**
 * Logger class with structured logging
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  private log(level: LogLevel, message: string, meta?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      ...this.context,
      ...meta,
    };

    // Mask sensitive data before logging
    const maskedEntry = maskSensitiveData(logEntry);

    // Use appropriate console method
    switch (level) {
      case "debug":
        console.debug(JSON.stringify(maskedEntry));
        break;
      case "info":
        console.log(JSON.stringify(maskedEntry));
        break;
      case "warn":
        console.warn(JSON.stringify(maskedEntry));
        break;
      case "error":
        console.error(JSON.stringify(maskedEntry));
        break;
    }
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log("debug", message, meta);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log("info", message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log("warn", message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log("error", message, meta);
  }
}

/**
 * Create logger from Hono context
 * Accepts optional variables and provides safe fallbacks when undefined
 */
export const createLogger = (variables?: HonoVariables): Logger => {
  return new Logger({
    requestId: variables?.requestId,
    userId: variables?.userId,
  });
};
