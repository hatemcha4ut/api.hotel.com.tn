/**
 * Version endpoint
 * Returns build metadata for version tracking and diagnostics
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "../types/env";

const version = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

/**
 * GET /version
 * Return build metadata including Git SHA, build timestamp, and environment
 */
version.get("/", async (c) => {
  const sha = c.env.GITHUB_SHA || "unknown";
  const builtAt = c.env.BUILT_AT || "unknown";
  const env = c.env.ENV || "development";

  return c.json({
    sha,
    builtAt,
    env,
    service: "api.hotel.com.tn",
    version: "1.0.0",
  });
});

/**
 * GET /version/health
 * Basic health check endpoint
 */
version.get("/health", async (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default version;
