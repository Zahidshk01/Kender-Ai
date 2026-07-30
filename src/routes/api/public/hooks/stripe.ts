import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { enforceRateLimits, getClientIp, logSecurityEvent } from "@/lib/api-security";


/**
 * Stripe webhook — keeps `public.subscriptions` in sync with Stripe.
 *
 * Setup:
 *  1. Add your Stripe payment links in `src/lib/subscription.ts`, appending
 *     `?client_reference_id=<user id>` so we can map the payment to a user.
 *  2. Point a Stripe webhook at
 *     https://<your-app>/api/public/hooks/stripe
 *  3. Save the signing secret as STRIPE_WEBHOOK_SECRET.
 */

/** Stripe signatures older than this are rejected (replay-attack window). */
const TOLERANCE_SECONDS = 300;

function verifySignature(
  payload: string,
  header: string,
  secret: string
): { ok: true } | { ok: false; reason: string } {
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=") as [string, string])
  );
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return { ok: false, reason: "malformed_header" };

  // Reject replays of an old (but genuinely signed) payload.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale_timestamp" };
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}

const ROUTE = "api/public/hooks/stripe";

export const Route = createFileRoute("/api/public/hooks/stripe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
          return new Response("Not configured", { status: 500 });
        }
        // Cap webhook volume so a leaked URL can't be used to flood us.
        const limited = await enforceRateLimits(
          [{ key: `stripe:${getClientIp(request)}`, limit: 120, windowSeconds: 60 }],
          60
        );
        if (limited) return limited;

        const sigHeader = request.headers.get("stripe-signature");
        const payload = await request.text();
        if (payload.length > 1_000_000) {
          return new Response("Payload too large", { status: 413 });
        }
        const verdict = sigHeader
          ? verifySignature(payload, sigHeader, secret)
          : ({ ok: false, reason: "missing_header" } as const);
        if (!verdict.ok) {
          await logSecurityEvent({
            event: "stripe_signature_rejected",
            outcome: "blocked",
            route: ROUTE,
            request,
            detail: { reason: verdict.reason },
          });
          return new Response("Invalid signature", { status: 401 });
        }


        let event: any;
        try {
          event = JSON.parse(payload);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const obj = event?.data?.object ?? {};
        const userId: string | undefined =
          obj.client_reference_id ?? obj.metadata?.user_id ?? undefined;
        const customerId: string | undefined =
          typeof obj.customer === "string" ? obj.customer : undefined;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = supabaseAdmin as any;

        const activate = async (status: string) => {
          if (!userId && !customerId) return;
          const row: Record<string, unknown> = {
            status,
            stripe_customer_id: customerId ?? null,
            stripe_subscription_id:
              typeof obj.subscription === "string" ? obj.subscription : obj.id ?? null,
            plan:
              obj.metadata?.plan ??
              (obj.items?.data?.[0]?.plan?.interval === "year" ? "yearly" : "monthly"),
            current_period_end: obj.current_period_end
              ? new Date(obj.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          };

          if (userId) {
            await admin.from("subscriptions").upsert({ user_id: userId, ...row });
          } else {
            await admin
              .from("subscriptions")
              .update(row)
              .eq("stripe_customer_id", customerId);
          }
        };

        switch (event.type) {
          case "checkout.session.completed":
          case "customer.subscription.created":
          case "customer.subscription.updated":
            await activate(
              obj.status === "canceled" || obj.status === "unpaid"
                ? "canceled"
                : "active"
            );
            break;
          case "customer.subscription.deleted":
            await activate("canceled");
            break;
          default:
            break;
        }

        return new Response("ok");
      },
    },
  },
});
