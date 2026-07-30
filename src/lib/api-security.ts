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

export async function requireAuth(request: Request, route = "api"): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    void logSecurityEvent({
      event: "api_auth_missing",
      outcome: "blocked",
      route,
      request,
    });
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
  // getClaims() verifies the JWT signature and expiry against Supabase Auth.
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) {
    void logSecurityEvent({
      event: "api_auth_invalid_token",
      outcome: "failure",
      route,
      request,
    });
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

/** Sign-in / account-creation attempts: 10 / 15 min per IP. */
export const authIpBucket = (ip: string): Bucket => ({
  key: `auth:ip:${ip}`,
  limit: 10,
  windowSeconds: 900,
});

/** Billing / subscription mutations: 5 / 5 min per user. */
export const billingUserBucket = (action: string, userId: string): Bucket => ({
  key: `bill:${action}:${userId}`,
  limit: 5,
  windowSeconds: 300,
});

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

export type SecurityEvent = {
  event: string;
  outcome?: "info" | "success" | "failure" | "blocked";
  userId?: string | null;
  route?: string | null;
  request?: Request | null;
  detail?: Record<string, unknown>;
};

/**
 * Append-only audit trail (auth attempts, API errors, abuse). Written with the
 * service role because clients must never be able to forge or delete entries.
 * Never throws — logging must not be able to break a request.
 */
export async function logSecurityEvent(e: SecurityEvent): Promise<void> {
  const row = {
    user_id: e.userId ?? null,
    event: e.event.slice(0, 64),
    outcome: e.outcome ?? "info",
    route: e.route?.slice(0, 128) ?? null,
    ip: e.request ? getClientIp(e.request).slice(0, 64) : null,
    user_agent: e.request?.headers.get("user-agent")?.slice(0, 512) ?? null,
    detail: e.detail ?? {},
  };
  console.info("[security]", { at: new Date().toISOString(), ...row });
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).from("security_events").insert(row);
  } catch (err) {
    console.error("[security] failed to persist event", err);
  }
}

// ---------------------------------------------------------------------------
// Machine-to-machine (cron / scheduler) authentication
// ---------------------------------------------------------------------------

/**
 * Guards internal jobs exposed under /api/public/*. The caller must present
 * CRON_SECRET, compared in constant time so the value can't be brute-forced
 * by timing. Returns a Response to send back when the caller is not trusted.
 */
export async function requireCronSecret(
  request: Request,
  route: string
): Promise<Response | null> {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    console.error(`[${route}] CRON_SECRET is not configured`);
    return json({ error: "Not configured" }, 503);
  }
  const header =
    request.headers.get("x-cron-secret") ??
    (request.headers.get("authorization")?.startsWith("Bearer ")
      ? request.headers.get("authorization")!.slice("Bearer ".length)
      : "");

  const a = new TextEncoder().encode(header);
  const b = new TextEncoder().encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  if (diff !== 0) {
    await logSecurityEvent({
      event: "cron_auth_failed",
      outcome: "blocked",
      route,
      request,
    });
    return json({ error: "Unauthorized" }, 401);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Basic bot / scraper heuristics
// ---------------------------------------------------------------------------

const BOT_UA =
  /(curl|wget|python-requests|httpie|scrapy|libwww|go-http-client|okhttp|java\/|bot\b|spider|crawler|headlesschrome|phantomjs|puppeteer)/i;

/**
 * Rejects obvious automated clients on user-facing endpoints. Deliberately
 * conservative: a missing/short UA or a known scripting agent is blocked, real
 * browsers are untouched. Rate limiting remains the primary defence.
 */
export async function rejectIfBot(
  request: Request,
  route: string,
  userId?: string
): Promise<Response | null> {
  const ua = request.headers.get("user-agent") ?? "";
  if (ua.length >= 15 && !BOT_UA.test(ua)) return null;
  await logSecurityEvent({
    event: "bot_blocked",
    outcome: "blocked",
    route,
    request,
    userId,
    detail: { ua: ua.slice(0, 200) },
  });
  return json({ error: "Automated access is not allowed." }, 403);
}


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
