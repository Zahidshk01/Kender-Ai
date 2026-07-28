import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  aiUserBucket,
  enforceRateLimits,
  getClientIp,
  requireAuth,
  sanitizeForLlm,
  uploadIpBucket,
} from "@/lib/api-security";

const ROUTE = "api/generate-character-image";

const schema = z.object({
  prompt: z.string().trim().min(1).max(1000),
  category: z
    .enum(["family", "friends", "group", "school", "relationships", "others"])
    .optional(),
});

// Free plan: 1 image generation / day. Pro: unlimited.
const FREE_IMAGES_PER_DAY = 1;


async function consumeQuota(
  userId: string,
  kind: "messages" | "images",
  freeLimit: number
): Promise<{ allowed: boolean; is_pro: boolean; used: number; limit: number }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).rpc("consume_quota", {
      _user_id: userId,
      _kind: kind,
      _free_limit: freeLimit,
    });
    if (error) {
      console.error("[generate-character-image] quota RPC error", error);
      return { allowed: true, is_pro: false, used: 0, limit: freeLimit };
    }
    return data as { allowed: boolean; is_pro: boolean; used: number; limit: number };
  } catch (e) {
    console.error("[generate-character-image] quota exception", e);
    return { allowed: true, is_pro: false, used: 0, limit: freeLimit };
  }
}


export const Route = createFileRoute("/api/generate-character-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await requireAuth(request);
        if ("errorResponse" in auth) return auth.errorResponse;

        const ip = getClientIp(request);
        const limited = await enforceRateLimits(
          [uploadIpBucket(ROUTE, ip), aiUserBucket(ROUTE, auth.userId)],
          60
        );
        if (limited) return limited;


        const quota = await consumeQuota(auth.userId, "images", FREE_IMAGES_PER_DAY);
        if (!quota.allowed) {
          return new Response(
            JSON.stringify({
              error: `Limit reached — free plan allows ${quota.limit} image per day. Get Pro for unlimited image generation.`,
              code: "limit_reached",
              kind: "images",
              limit: quota.limit,
            }),
            { status: 402, headers: { "Content-Type": "application/json" } }
          );
        }


        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "Invalid JSON" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "Prompt required (max 1000 chars)" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json" },
            }
          );
        }
        const category = parsed.data.category;
        const prompt = sanitizeForLlm(parsed.data.prompt, 1000);


        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          console.error("[generate-character-image] Missing LOVABLE_API_KEY");
          return new Response(
            JSON.stringify({ error: "AI generation is not configured." }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }

        const styleByCategory: Record<string, string> = {
          family:
            "Wholesome family-themed cinematic anime portrait. Warm, cozy, heartfelt mood — a parent, sibling, grandparent, or family member. Modest everyday clothing (casual home wear, sweaters, aprons), gentle smile, soft natural lighting, home or garden background. SFW, no sensual or suggestive content.",
          friends:
            "Cheerful friendship-themed cinematic anime portrait. Casual, fun, energetic vibe — a best friend character. Modern casual outfit (hoodie, tee, jacket), bright expression, urban or cafe backdrop, sunny lighting. SFW, no sensual or suggestive content.",
          group:
            "Group-themed cinematic anime portrait of a single character who belongs to a squad or crew. Coordinated casual outfit, confident pose, dynamic city or clubhouse setting, group-hangout mood. SFW, no sensual or suggestive content.",
          school:
            "School-themed cinematic anime portrait. Japanese high-school student aesthetic — school uniform (blazer or sailor style), classroom, rooftop, or cherry-blossom courtyard background, youthful and studious. Age-appropriate, fully clothed, SFW, no sensual or suggestive content.",
          relationships:
            "Romantic cinematic anime portrait. Sweet, tender, blushing romance mood — a boyfriend/girlfriend/crush archetype. Stylish but modest outfit, soft golden-hour or evening lighting, intimate but tasteful (holding hands, gentle gaze). SFW, romantic not explicit.",
          others:
            "Mature (18+) cinematic anime portrait. Sensual, seductive, dramatic mood — allowed to be flirtatious, alluring, and provocative in tone. Elegant fashion (evening wear, lingerie-adjacent styling, tailored suits), moody cinematic lighting, luxurious or nightlife setting. Still stylized anime, tasteful, artistic.",
        };
        const styleDirective =
          styleByCategory[category ?? "friends"] ?? styleByCategory.friends;

        const fullPrompt = `Hyper-realistic cinematic anime illustration. Photorealistic anime rendering — highly detailed skin, hair, and fabric textures, cinematic lighting, film-grade color grading, atmospheric depth, volumetric light, shallow depth of field, expressive detailed eyes, painterly background. Still stylized anime, NOT a real-life photograph, NOT 3D CGI, NOT live-action. ${styleDirective} Character: ${prompt}`;

        const modelLabels: Record<string, string> = {
          "google/gemini-2.5-flash-image": "Nano Banana",
          "google/gemini-3.1-flash-image": "Nano Banana 2",
          "google/gemini-3.1-flash-lite-image": "Nano Banana 2 Lite",
        };
        const models = [
          "google/gemini-2.5-flash-image",
          "google/gemini-3.1-flash-image",
          "google/gemini-3.1-flash-lite-image",
        ];

        let lastStatus = 500;
        let lastError = "Image generation failed. Please try again.";

        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: [{ role: "user", content: fullPrompt }],
              modalities: ["image", "text"],
            }),
          });

          if (upstream.ok) {
            const data = (await upstream.json()) as {
              data?: Array<{ b64_json?: string }>;
            };
            const b64 = data.data?.[0]?.b64_json;
            if (b64) {
              return new Response(
                JSON.stringify({
                  image: `data:image/png;base64,${b64}`,
                  model,
                  modelLabel: modelLabels[model] ?? model,
                  fellBack: i > 0,
                  attempts: i + 1,
                }),
                { headers: { "Content-Type": "application/json" } }
              );
            }
            lastStatus = 500;
            lastError = "Image generation failed. Please try again.";
            console.error("[generate-character-image] Empty response from", model);
            continue;
          }

          const text = await upstream.text();
          console.error("[generate-character-image] Upstream error", model, upstream.status, text);
          lastStatus = upstream.status;

          // Only fall back for capacity/credit/rate errors — not for 4xx validation issues
          if (upstream.status === 429) {
            lastError = "Rate limit reached. Please try again in a moment.";
            continue;
          }
          if (upstream.status === 402) {
            lastError = "AI credits exhausted. Please add credits in workspace settings.";
            continue;
          }
          if (upstream.status >= 500) {
            lastError = "Image generation failed. Please try again.";
            continue;
          }
          // Non-retryable — bail
          lastError = "Image generation failed. Please try again.";
          break;
        }

        return new Response(
          JSON.stringify({ error: lastError }),
          { status: lastStatus, headers: { "Content-Type": "application/json" } }
        );


      },
    },
  },
});
