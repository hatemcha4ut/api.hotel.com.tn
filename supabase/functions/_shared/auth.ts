/**
 * Unified authentication middleware
 * 
 * Security: Validates JWT tokens using Supabase auth
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AuthenticationError, AuthorizationError } from "./errors.ts";

/**
 * Extract JWT token from Authorization header
 */
const extractBearerToken = (request: Request): string | null => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeader.slice("Bearer ".length).trim();
};

/**
 * Require valid user JWT token
 * Throws AuthenticationError if token is invalid
 * Returns the authenticated user
 */
export const requireUserJWT = async (
  request: Request,
): Promise<{ userId: string; email?: string }> => {
  const token = extractBearerToken(request);
  if (!token) {
    throw new AuthenticationError("Missing bearer token");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration missing");
  }

  // Create client with user's JWT token
  const supabase = createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Verify token by getting user
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AuthenticationError("Invalid or expired token");
  }

  return {
    userId: user.id,
    email: user.email,
  };
};

/**
 * Require admin privileges
 * Checks if user has service role key OR is in admin_users table
 */
export const requireAdmin = async (request: Request): Promise<void> => {
  const token = extractBearerToken(request);
  if (!token) {
    throw new AuthenticationError("Missing bearer token");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase configuration missing");
  }

  // Check if token is service role key
  if (token === supabaseServiceKey) {
    return; // Service role has admin access
  }

  // Otherwise, verify user and check admin_users table
  const user = await requireUserJWT(request);

  // Check admin_users table
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", user.userId)
    .maybeSingle();

  if (!adminUser) {
    throw new AuthorizationError("Admin privileges required");
  }
};

/**
 * Create Supabase client with user authentication
 */
export const createAuthenticatedClient = (request: Request) => {
  const token = extractBearerToken(request);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Supabase configuration missing");
  }

  return createClient(supabaseUrl, supabaseKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
};
