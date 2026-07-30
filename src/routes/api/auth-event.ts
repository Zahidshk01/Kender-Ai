import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  authIpBucket,
  badRequest,
  enforceRateLimits,
  getClientIp,
  json,
  logSecurityEvent,
  rejectIfBot,
  serverError,
} from "@/lib/api-security";

const ROUTE = "api/auth-event";

const schema = z.object({
  event: z.enum(["sign_in_attempt", "sign_in_failed", "sign_in_success", "sign_out"]),
  provider: z.enum(["google", "apple"]).optional(),
  reason: z.string().trim().max(200).optional(),
});

/**
 * Records authentication attempts in the audit log and rate limits sign-in
 * bursts per IP (10 per 15 minutes) so credential-stuffing / OAuth-spam
 * scripts get shut down before they reach the identity provider.
 *
 * Intentionally unauthenticated (it runs *before* a session exists) — it
 * accepts no user-controlled identity and writes only to the audit table.
 */
export const Route = createFileRoute("/api/auth-event")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const bot = await rejectIfBot(request, ROUTE);
        if (bot) return bot;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return badRequest(ROUTE, "malformed json");
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) return badRequest(ROUTE, "schema");

        try {
          const ip = getClientIp(request);
          if (parsed.data.event === "sign_in_attempt") {
            const limited = await enforceRateLimits([authIpBucket(ip)], 300);
            if (limited) {
              await logSecurityEvent({
                event: "sign_in_rate_limited",
                outcome: "blocked",
                route: ROUTE,
                request,
                detail: { provider: parsed.data.provider },
              });
              return limited;
            }
          }

          await logSecurityEvent({
            event: parsed.data.event,
            outcome:
              parsed.data.event === "sign_in_failed"
                ? "failure"
                : parsed.data.event === "sign_in_success"
                  ? "success"
                  : "info",
            route: ROUTE,
            request,
            detail: {
              provider: parsed.data.provider ?? null,
              reason: parsed.data.reason ?? null,
            },
          });
          return json({ ok: true });
        } catch (error) {
          return serverError(ROUTE, error);
        }
      },
    },
  },
});
