/**
 * Shared server-side security helpers for API routes.
 * - Bearer-token auth (Supabase)
 * - IP + per-user rate limiting (429 + Retry-After)
 * - Generic error responses (never leak stack traces / upstream bodies)
 * - Prompt-injection sanitisation for LLM input
 */
import { createClient } from "@supabase/supabase-js";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function badRequest(route: string, detail: string, meta?: Record<string, unknown>) {
  console.warn(`[${route}] invalid input`, { at: new Date().toISOString(), detail, ...meta });
  return json({ error: "Invalid request" }, 400);
}

/** Log full context server-side, return a generic message to the client. */
export function serverError(route: string, error: unknown, meta?: Record<string, unknown>) {
  console.error(`[${route}] server error`, {
    at: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    ...meta,
  });
  return json({ error: "Something went wrong" }, 500);
}

export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export type AuthResult = { userId: string } | { errorResponse: Response };

export async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { errorResponse: json({ error: "Unauthorized" }, 401) };
  }
  const token = authHeader.slice("Bearer ".length);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    console.error("[auth] missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY");
    return { errorResponse: json({ error: "Something went wrong" }, 500) };
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) {
    return { errorResponse: json({ error: "Unauthorized" }, 401) };
  }
  return { userId };
}

async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_chat_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rate-limit] rpc error", error);
      return true; // fail open so a DB blip never breaks the app
    }
    return data === true;
  } catch (e) {
    console.error("[rate-limit] exception", e);
    return true;
  }
}

export function tooManyRequests(retryAfterSeconds: number) {
  return json(
    { error: "Too many requests. Please slow down and try again shortly." },
    429,
    { "Retry-After": String(retryAfterSeconds) }
  );
}

type Bucket = { key: string; limit: number; windowSeconds: number };

/** Returns a 429 Response when any bucket is exhausted, otherwise null. */
export async function enforceRateLimits(
  buckets: Bucket[],
  retryAfterSeconds = 30
): Promise<Response | null> {
  const results = await Promise.all(
    buckets.map((b) => hit(b.key, b.limit, b.windowSeconds))
  );
  return results.every(Boolean) ? null : tooManyRequests(retryAfterSeconds);
}

/** General API budget: 60 req / min per IP. */
export const generalIpBucket = (route: string, ip: string): Bucket => ({
  key: `gen:${route}:${ip}`,
  limit: 60,
  windowSeconds: 60,
});

/** LLM/AI proxy budget: 10 req / min per user. */
export const aiUserBucket = (route: string, userId: string): Bucket => ({
  key: `ai:${route}:${userId}`,
  limit: 10,
  windowSeconds: 60,
});

/** Upload-ish endpoints (image generation/upload): 5 req / min per IP. */
export const uploadIpBucket = (route: string, ip: string): Bucket => ({
  key: `upl:${route}:${ip}`,
  limit: 5,
  windowSeconds: 60,
});

/**
 * Strip common prompt-injection vectors and control characters from
 * untrusted text before it reaches an LLM.
 */
export function sanitizeForLlm(input: string | undefined, maxLen: number): string {
  if (!input) return "";
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/<\/?(system|assistant|developer|tool)[^>]*>/gi, "")
    .replace(
      /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)\b/gi,
      "[removed]"
    )
    .replace(/^\s*(system|developer)\s*:/gim, "")
    .slice(0, maxLen)
    .trim();
}
