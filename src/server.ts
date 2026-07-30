import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

// The Lovable editor renders the app inside an iframe, so clickjacking
// protection is enforced for production builds only.
const IS_PROD = import.meta.env.PROD;

const SUPABASE_ORIGIN = (() => {
  try {
    return new URL(process.env.SUPABASE_URL ?? "https://supabase.co").origin;
  } catch {
    return "https://supabase.co";
  }
})();

const SECURITY_HEADERS: Record<string, string> = {
  ...(IS_PROD ? { "X-Frame-Options": "DENY" } : {}),
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy":
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), interest-cohort=()",
  "Cross-Origin-Opener-Policy": IS_PROD ? "same-origin-allow-popups" : "unsafe-none",
  "Cross-Origin-Resource-Policy": "same-site",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Content-Security-Policy": [
    "default-src 'self'",
    // Vite/TanStack inject inline hydration scripts. 'unsafe-eval' is only
    // needed by the dev/HMR pipeline and is dropped from production builds.
    IS_PROD
      ? "script-src 'self' 'unsafe-inline'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob: https:",
    // Narrowed from "https:" to the backend + auth broker we actually call.
    IS_PROD
      ? `connect-src 'self' ${SUPABASE_ORIGIN} wss://${SUPABASE_ORIGIN.replace("https://", "")} https://api.lovable.dev https://ai.gateway.lovable.dev`
      : "connect-src 'self' https: wss:",
    IS_PROD ? "frame-ancestors 'none'" : "frame-ancestors *",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(IS_PROD ? ["upgrade-insecure-requests"] : []),
  ].join("; "),
};


function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v);
  headers.delete("X-Powered-By");
  headers.delete("Server");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Force HTTPS in production: plain-HTTP requests are 301'd to the TLS URL. */
function httpsRedirect(request: Request): Response | null {
  if (!IS_PROD) return null;
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  if (proto === "https" || url.hostname === "localhost") return null;
  url.protocol = "https:";
  return Response.redirect(url.toString(), 301);
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const redirect = httpsRedirect(request);
      if (redirect) return redirect;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return withSecurityHeaders(await normalizeCatastrophicSsrResponse(response));
    } catch (error) {
      console.error(error);
      return withSecurityHeaders(
        new Response(renderErrorPage(), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        })
      );
    }
  },
};


