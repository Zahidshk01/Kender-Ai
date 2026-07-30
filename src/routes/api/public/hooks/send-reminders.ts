import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const NUDGES = [
  (n: string) => `${n} is thinking about you… come say hi 💭`,
  (n: string) => `${n} wants to continue your conversation`,
  (n: string) => `${n} misses you — pick up where you left off`,
  (n: string) => `${n} left something unsaid… tap to reply`,
  (n: string) => `${n} is waiting for your next message`,
  (n: string) => `${n} has something to tell you`,
];

function pickNudge(seed: string, name: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return NUDGES[Math.abs(h) % NUDGES.length](name);
}

async function handle() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (serviceKey.startsWith("sb_") && h.get("Authorization") === `Bearer ${serviceKey}`) {
          h.delete("Authorization");
        }
        h.set("apikey", serviceKey);
        h.set("Authorization", `Bearer ${serviceKey}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@kender.app",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  );

  // Only nudge users who haven't been chatting recently (2h)
  const staleAfter = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  // Don't spam: minimum 20h between reminders per (user, character)
  const cooldown = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: subs, error: subErr } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, p256dh, auth");
  if (subErr) return { error: subErr.message, sent: 0 };
  if (!subs || subs.length === 0) return { sent: 0 };

  const byUser = new Map<string, typeof subs>();
  for (const s of subs) {
    const arr = byUser.get(s.user_id) ?? [];
    arr.push(s);
    byUser.set(s.user_id, arr);
  }

  let sent = 0;
  let removed = 0;

  for (const [userId, userSubs] of byUser.entries()) {
    // Find their most recent message per character
    const { data: msgs } = await admin
      .from("chat_messages")
      .select("character_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    const lastByChar = new Map<string, string>();
    (msgs ?? []).forEach((m: any) => {
      if (!lastByChar.has(m.character_id)) lastByChar.set(m.character_id, m.created_at);
    });
    if (lastByChar.size === 0) continue;

    // Pick one character whose last message is older than staleAfter
    const candidates = Array.from(lastByChar.entries()).filter(([, t]) => t < staleAfter);
    if (candidates.length === 0) continue;

    // Check cooldown
    const { data: states } = await admin
      .from("notifications_state")
      .select("character_id, last_sent_at")
      .eq("user_id", userId);
    const lastSent = new Map<string, string>();
    (states ?? []).forEach((s: any) => lastSent.set(s.character_id, s.last_sent_at));

    const eligible = candidates.filter(([cid]) => {
      const t = lastSent.get(cid);
      return !t || t < cooldown;
    });
    if (eligible.length === 0) continue;

    // Oldest chat first
    eligible.sort((a, b) => (a[1] < b[1] ? -1 : 1));
    const [characterId] = eligible[0];

    const { data: character } = await admin
      .from("characters")
      .select("id, name, image")
      .eq("id", characterId)
      .maybeSingle();
    if (!character) continue;

    const payload = JSON.stringify({
      title: character.name,
      body: pickNudge(userId + characterId, character.name),
      icon: character.image,
      image: character.image,
      url: `/chat/${character.id}`,
      tag: `kender-${character.id}`,
    });

    for (const s of userSubs) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        const code = err?.statusCode;
        if (code === 404 || code === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          removed++;
        }
      }
    }

    await admin
      .from("notifications_state")
      .upsert({ user_id: userId, character_id: characterId, last_sent_at: new Date().toISOString() });
  }

  return { sent, removed };
}

const ROUTE = "api/public/hooks/send-reminders";

/**
 * Internal scheduled job. It runs with the service role and can push a
 * notification to every user, so it is NOT open to the public internet:
 * the caller must present the CRON_SECRET (header `x-cron-secret` or
 * `Authorization: Bearer <CRON_SECRET>`), and is additionally rate limited.
 */
async function guarded(request: Request) {
  const denied = await requireCronSecret(request, ROUTE);
  if (denied) return denied;

  const limited = await enforceRateLimits(
    [{ key: `cron:${ROUTE}`, limit: 6, windowSeconds: 3600 }],
    600
  );
  if (limited) return limited;

  try {
    const result = await handle();
    await logSecurityEvent({ event: "cron_run", outcome: "success", route: ROUTE, request, detail: result as Record<string, unknown> });
    return Response.json(result);
  } catch (error) {
    return serverError(ROUTE, error);
  }
}

export const Route = createFileRoute("/api/public/hooks/send-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => guarded(request),
      GET: async ({ request }) => guarded(request),
    },
  },
});

