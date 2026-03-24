import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { create as createJwt, verify as verifyJwt } from "https://deno.land/x/djwt@v2.8/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// --- Environment Variables and Constants ---
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("JWT_SECRET")!;
const ADMIN_SECRET_KEY = Deno.env.get("ADMIN_SECRET_KEY")!;
const ALLOWED_ADMIN_EMAILS = Deno.env.get("ALLOWED_ADMIN_EMAILS"); // JSON array string

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !JWT_SECRET || !ADMIN_SECRET_KEY) {
  console.error("Missing required environment variables.");
  throw new Error("Missing required environment variables.");
}

const allowedOrigins = Deno.env.get("ALLOWED_CORS_ORIGINS")?.split(",").map((s) => s.trim()) || [];

const getCorsHeaders = (requestOrigin: string | null): Record<string, string> => {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };

  if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    headers["Access-Control-Allow-Origin"] = requestOrigin;
  } else if (allowedOrigins.length === 0) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else {
    headers["Access-Control-Allow-Origin"] = allowedOrigins[0] || "null";
  }

  return headers;
};

// --- Type Definitions ---
interface AdminUser {
  id: string;
  email: string;
  hashed_password: string;
  tier: "admin" | "super_admin";
  permissions: string[]; // This will likely come from a related table or be inferred
}

interface AdminAuthRequest {
  email: string;
  password?: string;
  admin_secret?: string;
}

interface AdminAuthResponse {
  success: boolean;
  token?: string;
  user?: {
    id: string;
    email: string;
    role: "admin" | "super_admin";
    permissions: string[];
  };
  error?: string;
  expires_at?: string;
}

type AdminAuthMethod = "password" | "admin_secret";

interface AuthStrategy {
  authenticate(email: string, credential: string): Promise<boolean>;
}

// Simple rate limiting store (in-memory, resets on function restart)
const loginAttempts = new Map<string, { count: number; lastAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(email: string, ip: string): { allowed: boolean; remaining: number } {
  const key = `${email}:${ip}`;
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || now - attempt.lastAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, lastAttempt: now });
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 };
  }

  if (attempt.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 };
  }

  attempt.count += 1;
  attempt.lastAttempt = now;
  loginAttempts.set(key, attempt);
  return { allowed: true, remaining: MAX_ATTEMPTS - attempt.count };
}

class SupabaseService {
  private client: ReturnType<typeof createClient>;

  constructor() {
    this.client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000), ...init }) }, // 10s timeout
    });
  }

  public getClient() {
    return this.client;
  }
}

class PasswordAuthStrategy implements AuthStrategy {
  async authenticate(email: string, password: string): Promise<boolean> {
    try {
      const supabase = new SupabaseService().getClient();

      const { data: adminUser, error } = await supabase
        .from("users") // Assuming table name is 'users'
        .select("id, email, hashed_password, tier")
        .eq("email", email)
        .in("tier", ["admin", "super_admin"]) // Both admin and super_admin tiers can authenticate with password
        .single();

      if (error || !adminUser || !adminUser.hashed_password) {
        console.error("User not found or password hash missing for email:", email, error);
        return false;
      }

      const isValid = await bcrypt.compare(password, adminUser.hashed_password);
      return isValid;
    } catch (error) {
      console.error("Password authentication error:", error);
      return false;
    }
  }
}

class SecretKeyAuthStrategy implements AuthStrategy {
  async authenticate(email: string, secretKey: string): Promise<boolean> {
    try {
      if (secretKey !== ADMIN_SECRET_KEY) {
        return false;
      }

      let allowedEmails: string[] = [];
      if (ALLOWED_ADMIN_EMAILS) {
        try {
          allowedEmails = JSON.parse(ALLOWED_ADMIN_EMAILS);
          if (!Array.isArray(allowedEmails)) {
            console.error("ALLOWED_ADMIN_EMAILS environment variable is not a valid JSON array.");
            allowedEmails = [];
          }
        } catch (e) {
          console.error("Failed to parse ALLOWED_ADMIN_EMAILS:", e);
          allowedEmails = [];
        }
      }

      return allowedEmails.includes(email);
    } catch (error) {
      console.error("Secret key authentication error:", error);
      return false;
    }
  }
}

async function validateAdminCredentials(
  email: string,
  credential: string,
  method: AdminAuthMethod
): Promise<boolean> {
  let strategy: AuthStrategy;
  if (method === "password") {
    strategy = new PasswordAuthStrategy();
  } else if (method === "admin_secret") {
    strategy = new SecretKeyAuthStrategy();
  } else {
    console.error("Invalid authentication method:", method);
    return false;
  }

  try {
    return await strategy.authenticate(email, credential);
  } catch (error) {
    console.error("Auth strategy execution error:", error);
    return false;
  }
}

async function getAdminUserData(email: string): Promise<{
  id: string;
  email: string;
  role: "admin" | "super_admin";
  permissions: string[]; // Permissions should be dynamic or derived
} | null> {
  try {
    const supabase = new SupabaseService().getClient();

    const { data: adminUser, error } = await supabase
      .from("users") // Assuming table name is 'users'
      .select("id, email, tier")
      .eq("email", email)
      .in("tier", ["admin", "super_admin"])
      .single();

    if (error || !adminUser) {
      console.error("Failed to fetch admin user data:", error);
      return null;
    }

    // Example permissions logic (can be expanded based on tier or other fields)
    let permissions: string[] = [];
    if (adminUser.tier === "super_admin") {
      permissions = ["full_access", "manage_users", "manage_settings"];
    } else if (adminUser.tier === "admin") {
      permissions = ["manage_content", "view_reports"];
    }

    return {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.tier,
      permissions: permissions,
    };
  } catch (error) {
    console.error("Error getting admin user data:", error);
    return null;
  }
}

async function generateJwt(user: { id: string; email: string; role: string; permissions: string[] }, secret: string): Promise<string> {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    permissions: user.permissions,
    iat: Date.now() / 1000,
    exp: Date.now() / 1000 + (60 * 60 * 24), // Token expires in 24 hours
  };

  const header = {
    alg: "HS512",
    typ: "JWT",
  };

  // Ensure JWT_SECRET is a Uint8Array
  const key = new TextEncoder().encode(secret);
  return await createJwt(header, payload, key);
}

// --- Main Handler ---
serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { email, password, admin_secret }: AdminAuthRequest = await req.json();

    if (!email) {
      return new Response(JSON.stringify({ success: false, error: "Email is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("X-Forwarded-For") || req.headers.get("X-Real-IP") || "unknown";
    const rateLimit = checkRateLimit(email, ip);

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ success: false, error: "Too many login attempts. Please try again later." }), {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": Math.ceil(WINDOW_MS / 1000 / 60).toString(), // Retry in minutes
        },
      });
    }

    let isAuthenticated = false;
    let authMethod: AdminAuthMethod | null = null;
    let credential = "";

    if (password) {
      authMethod = "password";
      credential = password;
      isAuthenticated = await validateAdminCredentials(email, password, "password");
    } else if (admin_secret) {
      authMethod = "admin_secret";
      credential = admin_secret;
      isAuthenticated = await validateAdminCredentials(email, admin_secret, "admin_secret");
    } else {
      return new Response(JSON.stringify({ success: false, error: "Password or admin_secret is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isAuthenticated) {
      return new Response(JSON.stringify({ success: false, error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminUserData = await getAdminUserData(email);

    if (!adminUserData) {
      return new Response(JSON.stringify({ success: false, error: "Admin user data not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await generateJwt(adminUserData, JWT_SECRET);
    const expiresAt = new Date(Date.now() + (60 * 60 * 24 * 1000)).toISOString(); // 24 hours from now

    const responseBody: AdminAuthResponse = {
      success: true,
      token: token,
      user: {
        id: adminUserData.id,
        email: adminUserData.email,
        role: adminUserData.role,
        permissions: adminUserData.permissions,
      },
      expires_at: expiresAt,
    };

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Authentication handler error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});