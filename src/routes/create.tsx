import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Image as ImageIcon, Sparkles, Upload, ChevronLeft, Wand2, Globe, Lock, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create · Kender" },
      { name: "description", content: "Create your own AI character on Kender in seconds." },
    ],
  }),
  component: CreatePage,
});

const nameSamples = [
  "Luna Nightshade", "Kai Ember", "Selene Vox", "Orion Frost",
  "Rhea Hollow", "Jett Marlowe", "Aria Wraith", "Cassian Vale",
];

function CreatePage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState<string | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [name, setName] = useState("");
  const [generatingName, setGeneratingName] = useState(false);
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [promptOpen, setPromptOpen] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [generatingFirst, setGeneratingFirst] = useState(false);

  const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB

  function onUpload(file?: File) {
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || !ALLOWED_IMAGE_EXT.test(file.name)) {
      return toast("Only PNG, JPG, WEBP or GIF images are allowed");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return toast("Image is too large — max 5MB");
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setShowImageMenu(false);
    };
    reader.readAsDataURL(file);
  }


  function openAiPrompt() {
    setShowImageMenu(false);
    setPromptOpen(true);
  }

  async function aiGenerateImage() {
    if (!imagePrompt.trim()) return toast("Describe your character first");
    setPromptOpen(false);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-character-image", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ prompt: imagePrompt, category: "friends" }),
      });
      const json = (await res.json()) as {
        image?: string;
        error?: string;
        code?: string;
        modelLabel?: string;
        fellBack?: boolean;
      };
      if (!res.ok || !json.image) {
        if (json.code === "limit_reached") {
          toast.error("Limit reached — GET PRO", {
            description: json.error,
            action: { label: "Get Pro", onClick: () => { window.location.href = "/premium"; } },
          });
        } else if (res.status === 429) toast("Rate limit hit. Try again in a moment.");
        else if (res.status === 402) toast("Out of AI credits. Add funds to continue.");
        else toast(json.error || "Couldn't generate image");
      } else {

        setImage(json.image);
        if (json.fellBack && json.modelLabel) {
          toast(`Switched to ${json.modelLabel} — primary model unavailable`);
        } else {
          toast("Anime portrait generated");
        }
      }
    } catch {
      toast("Network error generating image");
    } finally {
      setGenerating(false);
    }
  }

  async function generateName() {
    if (!image) {
      setName(nameSamples[Math.floor(Math.random() * nameSamples.length)]);
      return;
    }
    setGeneratingName(true);
    try {
      const res = await fetch("/api/generate-name", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ image, description: imagePrompt, category: "friends" }),
      });
      const json = (await res.json()) as { name?: string; error?: string };
      if (!res.ok || !json.name) {
        if (res.status === 429) toast("Rate limit hit. Try again in a moment.");
        else if (res.status === 402) toast("Out of AI credits. Add funds to continue.");
        else toast(json.error || "Couldn't generate name");
      } else {
        setName(json.name);
      }
    } catch {
      toast("Network error generating name");
    } finally {
      setGeneratingName(false);
    }
  }

  async function generateFirstMessage() {
    if (!image) return toast("Add an image first");
    if (!name.trim()) return toast("Give your character a name");
    setGeneratingFirst(true);
    try {
      const res = await fetch("/api/generate-first-message", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ name, description: imagePrompt, image }),
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok || !json.message) {
        if (res.status === 429) toast("Rate limit hit. Try again in a moment.");
        else if (res.status === 402) toast("Out of AI credits. Add funds to continue.");
        else toast(json.error || "Couldn't generate message");
      } else {
        setFirstMessage(json.message);
      }
    } catch {
      toast("Network error generating message");
    } finally {
      setGeneratingFirst(false);
    }
  }

  async function finish() {
    if (!image) return toast("Add an image first");
    if (!name.trim()) return toast("Give your character a name");
    if (!firstMessage.trim()) return toast("Add a first message");
    const { data: sess } = await supabase.auth.getSession();
    const owner_id = sess.session?.user.id ?? null;
    if (!owner_id) return toast("Please sign in first");
    // Never derive the public creator handle from the email address — that
    // would publish part of every creator's email on the feed.
    const { data: prof } = await (supabase as any)
      .from("profiles")
      .select("username")
      .eq("id", owner_id)
      .maybeSingle();
    const handle = prof?.username ? `@${String(prof.username).replace(/^@/, "")}` : "@you";
    const id = crypto.randomUUID();
    const { error } = await (supabase as any).from("characters").insert({
      id,
      name: name.trim(),
      image,
      creator: handle,

      chats: "0",
      category: "Friends",
      height: 80,
      tagline: firstMessage.slice(0, 80),
      relation: "your creation",
      first_message: firstMessage,
      persona: firstMessage,
      visibility,
      owner_id,
      sort_order: -Math.floor(Date.now() / 1000),
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${name} is ready to chat`);
    navigate({ to: "/chat/$id", params: { id } });
  }

  return (
    <div className="safe-top min-h-screen bg-background px-5 pb-48">
      {/* Top bar */}
      <div className="flex items-center justify-between px-1 pt-3">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-1 rounded-full p-2 text-sm font-medium text-foreground/90 active:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <span className="text-lg font-bold tracking-tight">Create character</span>
        <span className="w-10" />
      </div>

      <div className="mt-6 space-y-6">
        {/* Image upload card */}
        <section className="overflow-hidden rounded-3xl bg-surface p-1">
          <div className="relative flex flex-col items-center gap-4 rounded-[22px] bg-background p-5">
            <button
              type="button"
              onClick={() => setShowImageMenu((v) => !v)}
              className="group relative h-56 w-56 shrink-0 overflow-hidden rounded-3xl border border-border bg-surface-2 transition active:scale-95"
            >
              {image ? (
                <img src={image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <div className="rounded-2xl bg-surface p-4">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                </div>
              )}
              {generating && (
                <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-md">
                  <Sparkles className="h-7 w-7 animate-pulse text-primary" />
                </div>
              )}
            </button>

            <div className="flex flex-col items-center gap-2">
              <p className="text-[15px] font-semibold text-foreground">
                {image ? "Tap the image to change" : "Upload or generate image"}
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium transition active:bg-surface"
                >
                  <Upload className="h-4 w-4" /> Upload
                </button>
                <button
                  onClick={openAiPrompt}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition active:opacity-90"
                >
                  <Sparkles className="h-4 w-4" /> Generate image
                </button>
              </div>
            </div>

            {showImageMenu && (
              <div className="absolute left-1/2 top-1/2 z-20 w-[min(20rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-elegant">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm hover:bg-surface"
                >
                  <Upload className="h-4 w-4 text-primary" /> Upload from device
                </button>
                <button
                  onClick={openAiPrompt}
                  className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left text-sm hover:bg-surface"
                >
                  <Sparkles className="h-4 w-4 text-primary" /> Generate with AI
                </button>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onUpload(e.target.files?.[0])}
          />
        </section>

        {/* Name field */}
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <label className="text-sm font-semibold">Name</label>
            <span className="text-xs text-muted-foreground">{name.length}/30</span>
          </div>
          <div className="rounded-2xl bg-surface p-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 30))}
              placeholder="Name your character"
              maxLength={30}
              className="w-full bg-transparent text-[17px] font-semibold outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-3 flex items-center justify-center border-t border-border pt-3">
              <button
                onClick={generateName}
                disabled={generatingName}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition active:text-foreground disabled:opacity-50"
              >
                <Wand2 className={`h-4 w-4 ${generatingName ? "animate-spin" : ""}`} />
                {generatingName ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </section>

        {/* First Message field */}
        <section className="space-y-2">
          <label className="px-1 text-sm font-semibold">First Message</label>
          <div className="rounded-2xl bg-surface p-4">
            <textarea
              value={firstMessage}
              onChange={(e) => setFirstMessage(e.target.value)}
              placeholder=""
              rows={4}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            <div className="mt-3 flex items-center justify-center border-t border-border pt-3">
              <button
                onClick={generateFirstMessage}
                disabled={generatingFirst}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition active:text-foreground disabled:opacity-50"
              >
                <Wand2 className={`h-4 w-4 ${generatingFirst ? "animate-spin" : ""}`} />
                {generatingFirst ? "Generating…" : "Generate"}
              </button>
            </div>
          </div>
        </section>

        {/* Visibility */}
        <section className="space-y-2">
          <label className="px-1 text-sm font-semibold">Visibility</label>
          <div className="grid gap-3">
            {(
              [
                { id: "public", title: "Public", desc: "Anyone can see and chat with this character", icon: Globe },
                { id: "private", title: "Private", desc: "Only you can see and chat with this character", icon: Lock },
              ] as const
            ).map((opt) => {
              const active = visibility === opt.id;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  onClick={() => setVisibility(opt.id)}
                  className={`flex w-full items-center gap-4 rounded-2xl bg-surface p-4 text-left transition ${
                    active ? "ring-1 ring-primary" : ""
                  }`}
                >
                  <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${active ? "bg-primary/15 text-primary" : "bg-surface-2 text-muted-foreground"}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[15px] font-semibold">{opt.title}</div>
                    <div className="text-sm text-muted-foreground">{opt.desc}</div>
                  </div>
                  {active ? (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-4 w-4" />
                    </span>
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-border" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Create button */}
        <div className="fixed inset-x-0 bottom-20 left-1/2 w-full max-w-md -translate-x-1/2 bg-gradient-to-t from-background via-background/95 to-transparent px-5 pb-5 pt-8">
          <button
            onClick={finish}
            disabled={!image || !name.trim() || !firstMessage.trim()}
            className="h-13 w-full rounded-full bg-primary py-3.5 text-base font-semibold text-primary-foreground shadow-accent transition active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
          >
            Create character
          </button>
        </div>
      </div>

      {/* Generate image modal */}
      {promptOpen && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => !generating && setPromptOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-surface p-5 shadow-elegant"
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-lg font-bold">Generate image</h2>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Describe your character — looks, vibe, outfit, mood.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                aiGenerateImage();
              }}
            >
              <textarea
                autoFocus
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) {
                    e.preventDefault();
                    aiGenerateImage();
                  }
                }}
                placeholder="e.g. silver-haired swordswoman with violet eyes, hooded cloak, dusk lighting"
                rows={4}
                className="w-full resize-none rounded-2xl bg-surface-2 p-3.5 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary"
              />
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setPromptOpen(false)}
                  className="flex-1 rounded-full bg-surface-2 py-3 text-sm font-semibold transition active:bg-surface"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!imagePrompt.trim()}
                  className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground transition active:opacity-90 disabled:opacity-50"
                >
                  Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
