import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger, createLogger, maskSensitiveData } from "./logger";
import type { HonoVariables } from "../types/env";

describe("Logger", () => {
  describe("maskSensitiveData", () => {
    it("should mask email addresses", () => {
      const result = maskSensitiveData("user@example.com");
      expect(result).toBe("us***@example.com");
    });

    it("should mask phone numbers", () => {
      const result = maskSensitiveData("+21612345678");
      expect(result).toBe("+216******78");
    });

    it("should mask password-like strings", () => {
      const result = maskSensitiveData("mypassword123");
      expect(result).toBe("***");
    });

    it("should mask sensitive object fields", () => {
      const data = {
        username: "john",
        password: "secret123",
        email: "john@example.com",
        apiKey: "key123",
        phone: "+21612345678",
      };
      const result = maskSensitiveData(data) as Record<string, unknown>;
      expect(result.username).toBe("john");
      expect(result.password).toBe("***");
      expect(result.email).toBe("jo***@example.com");
      expect(result.apiKey).toBe("***");
      expect(result.phone).toBe("+216******78");
    });

    it("should handle arrays", () => {
      const data = ["user@example.com", "another@test.com"];
      const result = maskSensitiveData(data) as string[];
      expect(result[0]).toBe("us***@example.com");
      expect(result[1]).toBe("an***@test.com");
    });

    it("should handle null and undefined", () => {
      expect(maskSensitiveData(null)).toBe(null);
      expect(maskSensitiveData(undefined)).toBe(undefined);
    });
  });

  describe("Logger class", () => {
    beforeEach(() => {
      vi.spyOn(console, "debug").mockImplementation(() => {});
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should log debug messages", () => {
      const logger = new Logger({ requestId: "req-123" });
      logger.debug("test debug", { foo: "bar" });

      const debugSpy = vi.mocked(console.debug);
      expect(debugSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(debugSpy.mock.calls[0][0] as string);
      expect(loggedData.level).toBe("debug");
      expect(loggedData.message).toBe("test debug");
      expect(loggedData.requestId).toBe("req-123");
      expect(loggedData.foo).toBe("bar");
    });

    it("should log info messages", () => {
      const logger = new Logger({ requestId: "req-123", userId: "user-456" });
      logger.info("test info");

      const logSpy = vi.mocked(console.log);
      expect(logSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(loggedData.level).toBe("info");
      expect(loggedData.message).toBe("test info");
      expect(loggedData.requestId).toBe("req-123");
      expect(loggedData.userId).toBe("user-456");
    });

    it("should log warn messages", () => {
      const logger = new Logger();
      logger.warn("test warning");

      const warnSpy = vi.mocked(console.warn);
      expect(warnSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(warnSpy.mock.calls[0][0] as string);
      expect(loggedData.level).toBe("warn");
      expect(loggedData.message).toBe("test warning");
    });

    it("should log error messages", () => {
      const logger = new Logger({ requestId: "req-789" });
      logger.error("test error", { errorCode: 500 });

      const errorSpy = vi.mocked(console.error);
      expect(errorSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(errorSpy.mock.calls[0][0] as string);
      expect(loggedData.level).toBe("error");
      expect(loggedData.message).toBe("test error");
      expect(loggedData.requestId).toBe("req-789");
      expect(loggedData.errorCode).toBe(500);
    });

    it("should include timestamp in logs", () => {
      const logger = new Logger();
      logger.info("test");

      const logSpy = vi.mocked(console.log);
      const loggedData = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(loggedData.timestamp).toBeDefined();
      expect(new Date(loggedData.timestamp).toString()).not.toBe("Invalid Date");
    });

    it("should mask sensitive data in logs", () => {
      const logger = new Logger();
      logger.info("user data", {
        email: "user@example.com",
        password: "secret123",
      });

      const logSpy = vi.mocked(console.log);
      const loggedData = JSON.parse(logSpy.mock.calls[0][0] as string);
      expect(loggedData.email).toBe("us***@example.com");
      expect(loggedData.password).toBe("***");
    });
  });

  describe("createLogger", () => {
    it("should create logger with full variables", () => {
      const variables: HonoVariables = {
        requestId: "req-123",
        userId: "user-456",
        isAdmin: true,
      };
      const logger = createLogger(variables);

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should create logger with partial variables", () => {
      const variables: HonoVariables = {
        requestId: "req-123",
      };
      const logger = createLogger(variables);

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should create logger when variables is undefined", () => {
      const logger = createLogger(undefined);

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should create logger when variables is not provided", () => {
      const logger = createLogger();

      expect(logger).toBeInstanceOf(Logger);
    });

    it("should handle undefined requestId and userId gracefully", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      const logger = createLogger(undefined);
      logger.info("test message");

      expect(consoleSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedData.message).toBe("test message");
      expect(loggedData.requestId).toBeUndefined();
      expect(loggedData.userId).toBeUndefined();

      consoleSpy.mockRestore();
    });

    it("should preserve existing behavior when variables are provided", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      
      const variables: HonoVariables = {
        requestId: "req-123",
        userId: "user-456",
      };
      const logger = createLogger(variables);
      logger.info("test message");

      expect(consoleSpy).toHaveBeenCalledOnce();
      const loggedData = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(loggedData.message).toBe("test message");
      expect(loggedData.requestId).toBe("req-123");
      expect(loggedData.userId).toBe("user-456");

      consoleSpy.mockRestore();
    });
  });
});
