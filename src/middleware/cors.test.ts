/**
 * Tests for CORS middleware
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import { corsMiddleware } from "./cors";

describe("CORS middleware", () => {
  it("should return CORS headers for OPTIONS preflight when origin is allowed", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.use("*", corsMiddleware());
    app.post("/test", (c) => c.json({ message: "test" }));

    const mockEnv = {
      MYGO_LOGIN: "test",
      MYGO_PASSWORD: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn,https://admin.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.hotel.com.tn",
      },
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.hotel.com.tn");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("should NOT return CORS headers for OPTIONS preflight when origin is not allowed", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.use("*", corsMiddleware());
    app.post("/test", (c) => c.json({ message: "test" }));

    const mockEnv = {
      MYGO_LOGIN: "test",
      MYGO_PASSWORD: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://admin.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.hotel.com.tn",
      },
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("should return CORS headers for POST request when origin is allowed", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.use("*", corsMiddleware());
    app.post("/test", (c) => c.json({ message: "test" }));

    const mockEnv = {
      MYGO_LOGIN: "test",
      MYGO_PASSWORD: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/test", {
      method: "POST",
      headers: {
        Origin: "https://www.hotel.com.tn",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ test: "data" }),
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.hotel.com.tn");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("should handle /hotels/search OPTIONS preflight correctly", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.use("*", corsMiddleware());
    app.post("/hotels/search", (c) => c.json({ hotels: [] }));

    const mockEnv = {
      MYGO_LOGIN: "test",
      MYGO_PASSWORD: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/hotels/search", {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.hotel.com.tn",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.hotel.com.tn");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
    expect(res.headers.get("Access-Control-Allow-Headers")).toContain("Content-Type");
  });

  it("should use default allowed origins when ALLOWED_ORIGINS is not set", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.use("*", corsMiddleware());
    app.post("/test", (c) => c.json({ message: "test" }));

    const mockEnv = {
      MYGO_LOGIN: "test",
      MYGO_PASSWORD: "test",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "", // Empty - should use defaults
    } as Env;

    const req = new Request("http://localhost/test", {
      method: "OPTIONS",
      headers: {
        Origin: "https://www.hotel.com.tn",
      },
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://www.hotel.com.tn");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("OPTIONS");
  });
});
