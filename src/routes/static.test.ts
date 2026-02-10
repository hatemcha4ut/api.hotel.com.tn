/**
 * Tests for static routes
 */

import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";
import staticRoutes from "./static";

describe("GET /cities endpoint", () => {
  it("should return default cities when MYGO_LOGIN is missing", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    
    // Mount the static routes
    app.route("/static", staticRoutes);
    
    // Create a mock environment with missing MYGO_LOGIN
    const mockEnv = {
      MYGO_LOGIN: "",
      MYGO_PASSWORD: "test-password",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    // Make request
    const req = new Request("http://localhost/static/cities", {
      method: "GET",
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("items");
    expect(data).toHaveProperty("source");
    expect(data).toHaveProperty("cached");
    expect(data).toHaveProperty("fetchedAt");
    expect(data.source).toBe("default");
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("should return default cities when MYGO_PASSWORD is missing", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.route("/static", staticRoutes);
    
    const mockEnv = {
      MYGO_LOGIN: "test-login",
      MYGO_PASSWORD: "",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/static/cities", {
      method: "GET",
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.source).toBe("default");
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("should return default cities when both credentials are missing", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.route("/static", staticRoutes);
    
    const mockEnv = {
      MYGO_LOGIN: "",
      MYGO_PASSWORD: "",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/static/cities", {
      method: "GET",
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.source).toBe("default");
    expect(data.items.length).toBeGreaterThan(0);
  });

  it("should include cache-control and etag headers", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.route("/static", staticRoutes);
    
    const mockEnv = {
      MYGO_LOGIN: "",
      MYGO_PASSWORD: "",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/static/cities", {
      method: "GET",
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  it("should return 304 when etag matches", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.route("/static", staticRoutes);
    
    const mockEnv = {
      MYGO_LOGIN: "",
      MYGO_PASSWORD: "",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    // First request to get ETag
    const req1 = new Request("http://localhost/static/cities", {
      method: "GET",
    });
    const res1 = await app.fetch(req1, mockEnv);
    const etag = res1.headers.get("ETag");
    expect(etag).toBeTruthy();

    // Second request with If-None-Match
    const req2 = new Request("http://localhost/static/cities", {
      method: "GET",
      headers: {
        "If-None-Match": etag!,
      },
    });
    const res2 = await app.fetch(req2, mockEnv);
    expect(res2.status).toBe(304);
  });
});

describe("POST /list-city endpoint", () => {
  it("should return default cities when credentials are missing", async () => {
    const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();
    app.route("/static", staticRoutes);
    
    const mockEnv = {
      MYGO_LOGIN: "",
      MYGO_PASSWORD: "",
      SUPABASE_URL: "https://test.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-key",
      SUPABASE_ANON_KEY: "test-anon-key",
      JWT_SECRET: "test-secret",
      CLICTOPAY_USERNAME: "test",
      CLICTOPAY_PASSWORD: "test",
      CLICTOPAY_SECRET: "test",
      ALLOWED_ORIGINS: "https://www.hotel.com.tn",
    } as Env;

    const req = new Request("http://localhost/static/list-city", {
      method: "POST",
    });

    const res = await app.fetch(req, mockEnv);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("cities");
    expect(Array.isArray(data.cities)).toBe(true);
    expect(data.cities.length).toBeGreaterThan(0);
  });
});
