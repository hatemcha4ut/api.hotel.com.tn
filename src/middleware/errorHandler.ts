/**
 * Global error handler middleware
 * Catches and formats all errors consistently
 */

import type { Context } from "hono";
import { ZodError } from "zod";
import { createLogger } from "../utils/logger";
import type { HonoVariables } from "../types/env";

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, 401, "AUTHENTICATION_ERROR");
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Insufficient permissions") {
    super(message, 403, "AUTHORIZATION_ERROR");
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ExternalServiceError extends AppError {
  constructor(
    message: string,
    public service: string,
  ) {
    super(message, 502, "EXTERNAL_SERVICE_ERROR");
    this.name = "ExternalServiceError";
  }
}

export class InsufficientCreditError extends AppError {
  constructor(message: string = "Insufficient credit") {
    super(message, 409, "INSUFFICIENT_CREDIT");
    this.name = "InsufficientCreditError";
  }
}

/**
 * Error handler middleware
 */
export const errorHandler = () => {
  return async (c: Context<{ Variables: HonoVariables }>, err: Error) => {
    const logger = createLogger(c.var);

    // Handle Zod validation errors
    if (err instanceof ZodError) {
      logger.warn("Validation error", { errors: err.errors });
      return c.json(
        {
          error: "Validation error",
          code: "VALIDATION_ERROR",
          details: err.errors,
        },
        400,
      );
    }

    // Handle custom app errors
    if (err instanceof AppError) {
      logger.warn(`AppError: ${err.message}`, {
        statusCode: err.statusCode,
        code: err.code,
      });
      return c.json(
        {
          error: err.message,
          code: err.code,
        },
        err.statusCode,
      );
    }

    // Handle unknown errors
    logger.error("Unhandled error", {
      error: err.message,
      stack: err.stack,
    });

    return c.json(
      {
        error: "Internal server error",
        code: "INTERNAL_ERROR",
      },
      500,
    );
  };
};
