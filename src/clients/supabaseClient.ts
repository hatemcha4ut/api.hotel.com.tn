/**
 * Supabase client factory for Cloudflare Workers
 * Creates authenticated Supabase clients with proper configuration
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Env } from "../types/env";

/**
 * Create an authenticated Supabase client using service role key
 * Use this for backend operations that bypass RLS
 */
export const createServiceClient = (env: Env): SupabaseClient => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * Create an anonymous Supabase client using anon key
 * Use this for public operations that respect RLS
 */
export const createAnonClient = (env: Env): SupabaseClient => {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

/**
 * Create an authenticated Supabase client for a specific user
 * Use this for operations on behalf of an authenticated user
 */
export const createAuthenticatedClient = (
  env: Env,
  accessToken: string,
): SupabaseClient => {
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  return client;
};
