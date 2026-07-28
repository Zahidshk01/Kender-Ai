import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronDown, MoreVertical, Send, RotateCcw, Pencil, Check, X, Trash2, Lock, Flag, Ban, Share2, RefreshCw } from "lucide-react";
import { characters as localCharacters } from "@/lib/mock-data";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/character";
import { resolveImage } from "@/lib/character-images";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { blockTarget, reportTarget } from "@/lib/block-store";
import { toast } from "sonner";
import { useIsPro } from "@/lib/subscription";


export const Route = createFileRoute("/chat/$id")({
  head: ({ params }) => {
    const c = localCharacters.find((x) => x.id === params.id);
    return {
      meta: [
        { title: `${c?.name ?? "Chat"} · Kender` },
        { name: "description", content: c?.tagline ?? "Chat with an AI character." },
      ],
    };
  },
  component: ChatPage,
});

type Msg = {
  id: string;
  db_id?: string;
  from: "me" | "them";
  text: string;
  variants?: string[];
  variantIndex?: number;
};

function ChatPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [char, setChar] = useState<Character | null>(() => {
    const local = localCharacters.find((c) => c.id === id);
    return local ? (local as Character) : null;
  });
  const [loading, setLoading] = useState(!char);
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const isPro = useIsPro();

  const [reportOpen, setReportOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distanceFromBottom > 300);
  };

  const scrollToBottom = () => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  };

  // Load character from DB (in case it was created by user)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from("characters")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setChar({ ...data, image: resolveImage(data.id, data.image) } as Character);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Load user + persisted messages
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) return;
      const { data } = await (supabase as any)
        .from("chat_messages")
        .select("*")
        .eq("character_id", id)
        .eq("user_id", uid)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (data) {
        setMsgs(
          data.map((m: any) => ({
            id: m.id,
            db_id: m.id,
            from: m.role === "user" ? "me" : "them",
            text: m.content,
          })),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length]);

  if (loading) {
    return <div className="safe-top px-6 pt-20 text-center text-muted-foreground">Loading…</div>;
  }

  if (!char) {
    return (
      <div className="safe-top px-6 pt-20 text-center">
        <p className="text-muted-foreground">Character not found.</p>
        <Link to="/" className="mt-4 inline-block text-primary">Go home</Link>
      </div>
    );
  }

  const persistMessage = async (role: "user" | "assistant", content: string): Promise<string | undefined> => {
    if (!userId) return;
    const { data } = await (supabase as any).from("chat_messages").insert({
      user_id: userId,
      character_id: char.id,
      role,
      content,
    }).select("id").single();
    import("@/lib/chat-counts").then((m) => m.refreshChatCount(char.id));
    return data?.id as string | undefined;
  };

  const updateMessageContent = async (dbId: string | undefined, content: string) => {
    if (!dbId) return;
    await (supabase as any).from("chat_messages").update({ content }).eq("id", dbId);
  };

  const deleteFromDb = async (dbId: string | undefined) => {
    if (!dbId) return;
    await (supabase as any).from("chat_messages").delete().eq("id", dbId);
  };

  const requestReply = async (history: Msg[]): Promise<string> => {
    const apiMessages = history.map((m) => ({
      role: m.from === "me" ? "user" : "assistant",
      content: m.text,
    }));
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        characterName: char.name,
        characterDescription: char.tagline,
        characterCategory: char.category,
        characterRelation: char.relation,
        messages: apiMessages,
      }),
    });
    const data = await res.json();
    if (data?.code === "limit_reached") {
      setLimitReached(true);
      throw new Error(data.error || "Limit reached — GET PRO");
    }
    if (!res.ok) throw new Error(data?.details || data?.error || "Chat request failed");
    const replyText = data.reply?.trim();
    if (!replyText) throw new Error("No reply returned");
    return replyText;
  };


  const send = async () => {
    const v = text.trim();
    if (!v || sending) return;
    setSending(true);

    const localId = crypto.randomUUID();
    const mine: Msg = { id: localId, from: "me", text: v };
    const nextMsgs = [...msgs, mine];
    setMsgs(nextMsgs);
    setText("");
    persistMessage("user", v).then((dbId) => {
      if (dbId) setMsgs((arr) => arr.map((m) => (m.id === localId ? { ...m, db_id: dbId } : m)));
    });

    try {
      const replyText = await requestReply(nextMsgs);
      const replyLocalId = crypto.randomUUID();
      const reply: Msg = { id: replyLocalId, from: "them", text: replyText };
      setMsgs((m) => [...m, reply]);
      const dbId = await persistMessage("assistant", replyText);
      if (dbId) setMsgs((arr) => arr.map((m) => (m.id === replyLocalId ? { ...m, db_id: dbId } : m)));
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Something went wrong.";
      setMsgs((m) => [...m, { id: crypto.randomUUID(), from: "them", text: `⚠️ ${errorText}` }]);
    } finally {
      setSending(false);
    }
  };

  const regenerate = async (mid: string) => {
    const idx = msgs.findIndex((m) => m.id === mid);
    if (idx < 0) return;
    const target = msgs[idx];
    if (target.from !== "them") return;
    const existing = target.variants && target.variants.length > 0 ? target.variants : [target.text];
    if (existing.length >= 3) {
      // cycle through existing variants
      const next = ((target.variantIndex ?? 0) + 1) % existing.length;
      const newText = existing[next];
      setMsgs((arr) => arr.map((m) => (m.id === mid ? { ...m, variants: existing, variantIndex: next, text: newText } : m)));
      updateMessageContent(target.db_id, newText);
      return;
    }
    try {
      const history = msgs.slice(0, idx);
      const replyText = await requestReply(history);
      const nextVariants = [...existing, replyText];
      const newIndex = nextVariants.length - 1;
      setMsgs((arr) =>
        arr.map((m) => (m.id === mid ? { ...m, variants: nextVariants, variantIndex: newIndex, text: replyText } : m)),
      );
      updateMessageContent(target.db_id, replyText);
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "Regenerate failed.";
      setMsgs((arr) => arr.map((m) => (m.id === mid ? { ...m, text: `⚠️ ${errorText}` } : m)));
    }
  };

  const editMessage = (mid: string, newText: string) => {
    setMsgs((arr) => arr.map((m) => (m.id === mid ? { ...m, text: newText } : m)));
    const target = msgs.find((m) => m.id === mid);
    if (target) updateMessageContent(target.db_id, newText);
  };

  const deleteMessage = (mid: string) => {
    const target = msgs.find((m) => m.id === mid);
    setMsgs((arr) => arr.filter((m) => m.id !== mid));
    if (target) deleteFromDb(target.db_id);
  };


  const blockTargetId = char.owner_id ? char.owner_id : `h:${(char.creator ?? char.name).replace(/^@/, "")}`;

  const onShare = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}/chat/${char.id}` : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: char.name, text: char.tagline ?? "", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      /* ignore */
    }
  };

  const onSubmitReport = async () => {
    if (!reportReason) {
      toast.error("Please select a reason");
      return;
    }
    await reportTarget(blockTargetId, reportReason, reportDetails);
    setReportOpen(false);
    setReportReason("");
    setReportDetails("");
    toast.success("Report submitted. Thank you.");
  };

  const onBlock = async () => {
    await blockTarget(blockTargetId);
    setConfirmBlock(false);
    toast.success(`Blocked ${char.name}`);
    navigate({ to: "/" });
  };

  const onRestart = async () => {
    if (userId) {
      await (supabase as any)
        .from("chat_messages")
        .delete()
        .eq("character_id", char.id)
        .eq("user_id", userId);
    }
    setMsgs([]);
    setConfirmRestart(false);
    toast.success("Conversation restarted");
  };

  const opening = char.first_message || openingScene(char.name, char.category ?? "", char.tagline ?? "");
  const charImage = char.image || "/placeholder.png";


  return (
    <div className="flex min-h-screen flex-col bg-background pb-0">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="safe-top" />
        <div className="relative flex items-center px-3 py-3">
          <button
            onClick={() => navigate({ to: "/" })}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface active:scale-95"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 flex h-full items-center justify-center">
            <div className="text-lg font-bold tracking-[0.2em]">KENDER</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
          {isPro ? (
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text px-1 text-xs font-extrabold uppercase tracking-widest text-transparent">
              Premium
            </span>
          ) : (
            <button
              onClick={() => navigate({ to: "/premium" })}
              className="rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 text-xs font-bold text-black active:scale-95"
            >
              Get Pro
            </button>
          )}

          <Popover>
            <PopoverTrigger asChild>
              <button aria-label="More" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface active:scale-95">
                <MoreVertical className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <button
                onClick={() => setReportOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm active:bg-surface"
              >
                <Flag className="h-4 w-4" /> Report
              </button>
              <button
                onClick={onShare}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm active:bg-surface"
              >
                <Share2 className="h-4 w-4" /> Share
              </button>
              <button
                onClick={() => setConfirmBlock(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-orange-400 active:bg-surface"
              >
                <Ban className="h-4 w-4" /> Block
              </button>
              <button
                onClick={() => setConfirmRestart(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm active:bg-surface"
              >
                <RefreshCw className="h-4 w-4" /> Restart conversation
              </button>
            </PopoverContent>
          </Popover>
        </div>
        </div>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-4 pb-32 pt-4">
        <Link
          to="/u/$userId"
          params={{ userId: char.owner_id ? char.owner_id : `h:${(char.creator ?? char.name).replace(/^@/, "")}` }}
          className="mb-6 flex items-center gap-3 rounded-full bg-surface px-3 py-2 active:scale-[0.98] transition"
        >
          <img src={charImage} alt={char.name} className="h-10 w-10 rounded-full object-cover" />
          <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-base font-semibold">
            <span className="truncate">{char.name} <span className="text-muted-foreground">({char.relation})</span></span>
            {char.visibility === "private" && (
              <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                <Lock className="h-3 w-3" /> Private
              </span>
            )}
          </div>
        </Link>

        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          <span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <CharacterMessage image={charImage} text={opening} ownerId={char.owner_id ? char.owner_id : `h:${(char.creator ?? char.name).replace(/^@/, "")}`} />

        <div className="mt-4 space-y-4">
          {(() => {
            let lastThemIdx = -1;
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].from === "them") { lastThemIdx = i; break; }
            }
            return msgs.map((m, i) =>
              m.from === "me" ? (
                <UserMessage
                  key={m.id}
                  text={m.text}
                  onDelete={() => deleteMessage(m.id)}
                />
              ) : (
                <CharacterMessage
                  key={m.id}
                  image={charImage}
                  text={m.text}
                  ownerId={char.owner_id ? char.owner_id : `h:${(char.creator ?? char.name).replace(/^@/, "")}`}
                  onRegenerate={i === lastThemIdx ? () => regenerate(m.id) : undefined}
                  onEdit={i === lastThemIdx ? (t) => editMessage(m.id, t) : undefined}
                  onDelete={i === lastThemIdx ? () => deleteMessage(m.id) : undefined}
                />
              ),
            );
          })()}
        </div>
        <div ref={endRef} />
      </div>

      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to latest"
          className="fixed left-1/2 z-40 -translate-x-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-foreground shadow-lg backdrop-blur-xl border border-border active:scale-95"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 88px)" }}
        >
          <ChevronDown className="h-5 w-5" />
        </button>
      )}

      <div className="fixed inset-x-0 bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-border bg-background/90 px-3 py-3 backdrop-blur-xl safe-bottom md:bottom-6 md:rounded-b-[40px]">
        {limitReached && !isPro ? (
          <button
            onClick={() => navigate({ to: "/premium" })}
            className="flex w-full flex-col items-center gap-1 rounded-3xl bg-surface px-4 py-4 active:scale-[0.99]"
          >
            <span className="text-sm font-semibold text-foreground">Limit reached</span>
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-base font-extrabold uppercase tracking-widest text-transparent">
              Get Pro
            </span>
            <span className="text-xs text-muted-foreground">
              You've used all 25 free messages today. Upgrade for unlimited chats.
            </span>
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center rounded-full bg-surface px-4 py-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Type a message"
                className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <button
              onClick={send}
              aria-label="Send"
              disabled={sending}
              className="flex h-11 w-11 items-center justify-center rounded-full gradient-accent text-primary-foreground shadow-accent active:scale-95 disabled:opacity-60"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>


      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {char.name}</DialogTitle>
            <DialogDescription>Help us understand what's wrong.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {["Spam", "Harassment", "Inappropriate content", "Impersonation", "Other"].map((r) => (
              <label key={r} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 text-sm">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reportReason === r}
                  onChange={() => setReportReason(r)}
                />
                {r}
              </label>
            ))}
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              placeholder="Additional details (optional)"
              className="min-h-[80px] w-full rounded-xl bg-surface px-3 py-2 text-sm outline-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setReportOpen(false)}
              className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={onSubmitReport}
              className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Submit
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block confirmation */}
      <Dialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block {char.name}?</DialogTitle>
            <DialogDescription>
              You won't see this character or its creator. You can unblock from Settings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setConfirmBlock(false)}
              className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={onBlock}
              className="flex-1 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white"
            >
              Block
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restart confirmation */}
      <Dialog open={confirmRestart} onOpenChange={setConfirmRestart}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart conversation?</DialogTitle>
            <DialogDescription>
              This deletes all messages with {char.name}. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setConfirmRestart(false)}
              className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              onClick={onRestart}
              className="flex-1 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Restart
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CharacterMessage({
  image,
  text,
  ownerId,
  onRegenerate,
  onEdit,
  onDelete,
}: {
  image: string;
  text: string;
  ownerId?: string;
  onRegenerate?: () => void;
  onEdit?: (newText: string) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);

  const avatar = (
    <img src={image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
  );

  return (
    <div className="flex gap-2">
      {ownerId ? (
        <Link to="/u/$userId" params={{ userId: ownerId }} className="shrink-0 active:scale-95">
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="max-w-full">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full resize-none rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm outline-none focus:border-primary"
              rows={Math.max(3, draft.split("\n").length + 1)}
              autoFocus
            />
            <div className="mt-1 flex gap-2">
              <button
                onClick={() => {
                  onEdit?.(draft.trim() || text);
                  setEditing(false);
                }}
                className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              >
                <Check className="h-3.5 w-3.5" /> Save
              </button>
              <button
                onClick={() => {
                  setDraft(text);
                  setEditing(false);
                }}
                className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs"
              >
                <X className="h-3.5 w-3.5" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-surface px-4 py-3 text-sm leading-relaxed font-sans antialiased">
              <RichText text={text} />
            </div>
            {(onRegenerate || onEdit || onDelete) && (
              <div className="flex flex-col gap-1.5 pt-1">
                {onEdit && (
                  <button
                    onClick={() => setEditing(true)}
                    aria-label="Edit reply"
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-muted-foreground active:scale-95"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
                {onRegenerate && (
                  <button
                    onClick={onRegenerate}
                    aria-label="Regenerate reply"
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-muted-foreground active:scale-95"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                )}
                {onDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete reply"
                    className="flex h-8 w-8 items-center justify-center rounded-md bg-surface text-muted-foreground active:scale-95"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {confirmDelete && onDelete && (
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UserMessage({ text, onDelete }: { text: string; onDelete: () => void }) {
  const [showDelete, setShowDelete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setShowDelete(true), 500);
  };
  const cancel = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <div
          onMouseDown={start}
          onMouseUp={cancel}
          onMouseLeave={cancel}
          onTouchStart={start}
          onTouchEnd={cancel}
          onContextMenu={(e) => {
            e.preventDefault();
            setShowDelete(true);
          }}
          className="cursor-pointer select-none whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-surface px-4 py-3 text-sm leading-relaxed font-sans antialiased active:opacity-90"
        >
          {text}
        </div>
        {showDelete && (
          <div className="flex gap-2">
            <button
              onClick={() => {
                onDelete();
                setShowDelete(false);
              }}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              onClick={() => setShowDelete(false)}
              className="flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-xs"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function RichText({ text }: { text: string }) {
  const parts = text.split(/("[^"]*"|“[^”]*”)/g).filter(Boolean);
  return (
    <p className="whitespace-pre-wrap font-sans antialiased">
      {parts.map((p, i) => {
        const isSpeech = /^["“].*["”]$/.test(p);
        return isSpeech ? (
          <span key={i} className="font-semibold text-foreground">{p}</span>
        ) : (
          <span key={i} className="font-sans font-normal italic text-foreground">{p}</span>
        );
      })}
    </p>
  );
}

function openingScene(name: string, category: string, tagline: string) {
  const first = name.split(" ")[0];
  switch (category) {
    case "Romance":
      return `${first} leans against the doorway, eyes locked on yours, a slow smile spreading across their face. "There you are. I was starting to wonder if you'd come."`;
    case "Horror":
      return `The room grows colder as ${first} steps from the shadows, voice barely a whisper. "You shouldn't have come back."`;
    case "Fantasy":
      return `${first} draws their blade halfway, then pauses — recognition flickering in their eyes. "Speak quickly. The forest is listening."`;
    case "Anime":
      return `${first} glances up from the glowing screens, smirking. "You're late. I almost started without you."`;
    case "Adventure":
      return `${first} tosses you a comm unit. "Strap in. We launch in sixty."`;
    case "Friends":
      return `${first} waves you over, two warm cups already on the table. "Took you long enough — sit, sit."`;
    default:
      return `${first} looks up as you arrive, expression unreadable. "${tagline}"`;
  }
}
