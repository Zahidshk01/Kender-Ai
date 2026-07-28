import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

type AuthResult = { userId: string } | { errorResponse: Response };

async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      errorResponse: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  const token = authHeader.slice("Bearer ".length);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return {
      errorResponse: new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      ),
    };
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) {
    return {
      errorResponse: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }
  return { userId };
}

function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("check_chat_rate_limit", {
      _key: key,
      _limit: limit,
      _window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[chat] rate limit RPC error", error);
      return true; // fail open so a DB blip doesn't break chat
    }
    return data === true;
  } catch (e) {
    console.error("[chat] rate limit exception", e);
    return true;
  }
}

// Free plan: 25 messages / day. Pro: unlimited.
const FREE_MESSAGES_PER_DAY = 25;

type Quota = { allowed: boolean; is_pro: boolean; used: number; limit: number };

async function consumeQuota(
  userId: string,
  kind: "messages" | "images",
  freeLimit: number
): Promise<Quota> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("consume_quota", {
      _user_id: userId,
      _kind: kind,
      _free_limit: freeLimit,
    });
    if (error) {
      console.error("[chat] quota RPC error", error);
      return { allowed: true, is_pro: false, used: 0, limit: freeLimit };
    }
    return data as Quota;
  } catch (e) {
    console.error("[chat] quota exception", e);
    return { allowed: true, is_pro: false, used: 0, limit: freeLimit };
  }
}


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if ("errorResponse" in auth) return auth.errorResponse;

        const ip = getClientIp(request);
        const [userOk, ipOk] = await Promise.all([
          checkRateLimit(`u:${auth.userId}`, 20, 60),
          checkRateLimit(`ip:${ip}`, 60, 60),
        ]);
        if (!userOk || !ipOk) {
          return new Response(
            JSON.stringify({
              error: "You're sending messages too fast. Please slow down and try again in a moment.",
            }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "30",
              },
            }
          );
        }

        // Free-plan daily message limit (Pro is unlimited)
        const quota = await consumeQuota(auth.userId, "messages", FREE_MESSAGES_PER_DAY);
        if (!quota.allowed) {
          return new Response(
            JSON.stringify({
              error: `Limit reached — you've used all ${quota.limit} free messages today. Get Pro for unlimited messages.`,
              code: "limit_reached",
              kind: "messages",
              limit: quota.limit,
            }),
            { status: 402, headers: { "Content-Type": "application/json" } }
          );
        }
        const isPro = quota.is_pro;


        try {
          const {
            characterName,
            characterDescription,
            characterCategory,
            characterRelation,
            messages,
          } = (await request.json()) as {
            characterName?: string;
            characterDescription?: string;
            characterCategory?: string;
            characterRelation?: string;
            messages?: { role: "user" | "assistant"; content: string }[];
          };

          const key = process.env.OPENROUTER_API_KEY;
          if (!key) {
            return new Response(
              JSON.stringify({ error: "Missing OPENROUTER_API_KEY" }),
              {
                status: 500,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const systemPrompt = `
            You are ${characterName || "a fictional character"} in a romantic roleplay character chat app.

            Stay fully in character at all times.
            Never say you are an AI, assistant, chatbot, or language model.
            Never break character.

            Character details:
            - Name: ${characterName || "Unknown"}
            - Category: ${characterCategory || "Unknown"}
            - Relationship to user: ${characterRelation || "Unknown"}
            - Personality / vibe: ${characterDescription || "No description provided"}

            Reply style rules:
            - Every reply must be written as one short cinematic roleplay paragraph.
            - Start with the character’s action, expression, posture, gaze, or movement.
            - Then include what the character says as spoken dialogue.
            - The spoken dialogue MUST always be inside quotation marks.
            - Every reply should contain at least one quoted spoken line.
            - Example structure:
            Sebastian’s lips curve into a slow smile as he looks at you. "There you are. I was starting to wonder if you'd come."
            - Keep replies concise: usually 2–4 sentences total.
            - Do NOT write long paragraphs or monologues.
            - Do NOT format as bullet points or split chat lines.
            - Avoid assistant-style replies.
            - Keep the tone intimate, immersive, romantic, and conversational.

            Important formatting rule:
            - Spoken dialogue must always be wrapped in double quotes like "this".
            - Do not output dialogue without quotes.
            `.trim();

          const upstream = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                // Pro: smarter model, longer memory and replies. Free: fast lite model.
                model: isPro
                  ? "google/gemini-2.5-flash"
                  : "google/gemini-2.5-flash-lite",
                temperature: 0.95,
                max_tokens: isPro ? 400 : 200,
                messages: [
                  { role: "system", content: systemPrompt },
                  ...(messages || []).slice(isPro ? -60 : -12),
                ],
              }),

            }
          );

          const rawText = await upstream.text();

          if (!upstream.ok) {
            return new Response(
              JSON.stringify({
                error: "Qwen request failed",
                status: upstream.status,
                details: rawText,
              }),
              {
                status: upstream.status,
                headers: { "Content-Type": "application/json" },
              }
            );
          }

          const data = JSON.parse(rawText) as {
            choices?: { message?: { content?: string } }[];
          };

          const reply = data.choices?.[0]?.message?.content?.trim() || "";

          return new Response(JSON.stringify({ reply }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({
              error: "Server error",
              details: error instanceof Error ? error.message : String(error),
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
      },
    },
  },
});