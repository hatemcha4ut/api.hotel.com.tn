/**
 * Tests for error handler middleware
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { errorHandler, AppError, ValidationError, AuthenticationError } from "./errorHandler";
import { z } from "zod";

describe("Error handler middleware", () => {
  it("should handle ZodError and return 400", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      // Trigger a Zod validation error
      const schema = z.object({ name: z.string() });
      schema.parse({ name: 123 }); // This will throw
      return new Response("ok");
    });
    
    const res = await app.request("/test");
    expect(res.status).toBe(400);
    
    const data = await res.json() as any;
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toBe("Validation error");
  });

  it("should handle AppError and return custom status code", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      throw new AppError("Custom error", 418, "CUSTOM_CODE");
    });
    
    const res = await app.request("/test");
    expect(res.status).toBe(418);
    
    const data = await res.json() as any;
    expect(data.code).toBe("CUSTOM_CODE");
    expect(data.error).toBe("Custom error");
  });

  it("should handle ValidationError and return 400", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      throw new ValidationError("Invalid input");
    });
    
    const res = await app.request("/test");
    expect(res.status).toBe(400);
    
    const data = await res.json() as any;
    expect(data.code).toBe("VALIDATION_ERROR");
    expect(data.error).toBe("Invalid input");
  });

  it("should handle AuthenticationError and return 401", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      throw new AuthenticationError();
    });
    
    const res = await app.request("/test");
    expect(res.status).toBe(401);
    
    const data = await res.json() as any;
    expect(data.code).toBe("AUTHENTICATION_ERROR");
    expect(data.error).toBe("Authentication required");
  });

  it("should handle generic Error and return 500", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      throw new Error("Unexpected error");
    });
    
    const res = await app.request("/test");
    expect(res.status).toBe(500);
    
    const data = await res.json() as any;
    expect(data.code).toBe("INTERNAL_ERROR");
    expect(data.error).toBe("Internal server error");
  });

  it("should work with c.json properly (no crash)", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    app.onError(errorHandler());
    
    app.get("/test", () => {
      throw new AppError("Test error", 400);
    });
    
    const res = await app.request("/test");
    
    // The key test: c.json should work, not crash
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.status).toBe(400);
    
    const data = await res.json() as any;
    expect(data).toHaveProperty("error");
    expect(data.error).toBe("Test error");
  });
});
