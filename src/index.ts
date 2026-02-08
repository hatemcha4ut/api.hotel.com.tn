/**
 * Cloudflare Worker entry point using Hono framework
 * Complete API for hotel.com.tn with myGO and ClicToPay integration
 */

import { Hono } from "hono";
import type { Env, HonoVariables } from "./types/env";
import { corsMiddleware } from "./middleware/cors";
import { requestIdMiddleware } from "./middleware/requestId";
import { errorHandler } from "./middleware/errorHandler";
import { extractGuestSession } from "./middleware/auth";

// Import route handlers
import auth from "./routes/auth";
import profile from "./routes/profile";
import static from "./routes/static";
import hotels from "./routes/hotels";
import bookings from "./routes/bookings";
import checkout from "./routes/checkout";
import payments from "./routes/payments";
import admin from "./routes/admin";
import version from "./routes/version";

// Create Hono app
const app = new Hono<{ Bindings: Env; Variables: HonoVariables }>();

// Global middleware
app.use("*", corsMiddleware());
app.use("*", requestIdMiddleware());
app.use("*", extractGuestSession());

// Error handler
app.onError(errorHandler());

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Mount route handlers
app.route("/auth", auth);
app.route("/profile", profile);
app.route("/static", static);
app.route("/hotels", hotels);
app.route("/bookings", bookings);
app.route("/checkout", checkout);
app.route("/payments", payments);
app.route("/api/admin", admin);
app.route("/version", version);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      code: "NOT_FOUND",
      path: c.req.path,
    },
    404
  );
});

// Export for Cloudflare Workers
export default app;
