/**
 * Cloudflare Worker environment bindings
 * All secrets and environment variables available to the Worker
 */
export interface Env {
  // MyGO API credentials
  MYGO_LOGIN: string;
  MYGO_PASSWORD: string;

  // Supabase configuration
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  // JWT secret (renamed from SUPABASE_JWT_SECRET - Cloudflare does not allow SUPABASE_ prefix for secrets)
  JWT_SECRET: string;

  // ClicToPay credentials
  CLICTOPAY_USERNAME: string;
  CLICTOPAY_PASSWORD: string;
  CLICTOPAY_SECRET: string;
  CLICTOPAY_BASE_URL?: string; // Optional: defaults to test URL if not provided
  
  // Payment test mode (when true, returns mock responses without calling real payment provider)
  PAYMENT_TEST_MODE?: string; // "true" or "false"

  // CORS configuration
  ALLOWED_ORIGINS: string; // Comma-separated list

  // Optional upstream URL
  HOTEL_UPSTREAM_BASE_URL?: string;

  // Build metadata (injected at build time)
  GITHUB_SHA?: string;
  BUILT_AT?: string;
  ENV?: string; // production, staging, development
}

/**
 * Context extensions for Hono
 */
export interface HonoVariables {
  requestId: string;
  userId?: string;
  isAdmin?: boolean;
  guestSessionId?: string;
}
