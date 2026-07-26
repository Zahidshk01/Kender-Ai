import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Search, Trash2, MessageCircle, X, CheckCircle2, Circle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { characters as localCharacters } from "@/lib/mock-data";
import { resolveImage } from "@/lib/character-images";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/chats")({
  head: () => ({
    meta: [
      { title: "Chats · Kender" },
      { name: "description", content: "Your conversations with AI characters." },
    ],
  }),
  component: ChatsPage,
});

type ChatRow = {
  characterId: string;
  name: string;
  image: string;
  last: string;
  time: string;
};

function timeAgo(iso: string) {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function ChatsPage() {
  const navigate = useNavigate();
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | "selected" | "all">(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const pressTimer = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) {
      setChats([]);
      setLoading(false);
      return;
    }
    const { data: msgs } = await (supabase as any)
      .from("chat_messages")
      .select("character_id, content, created_at, role")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (!msgs) {
      setChats([]);
      setLoading(false);
      return;
    }
    const byChar = new Map<string, { last: string; created_at: string }>();
    for (const m of msgs) {
      if (!byChar.has(m.character_id))
        byChar.set(m.character_id, { last: m.content, created_at: m.created_at });
    }
    const ids = Array.from(byChar.keys());
    if (ids.length === 0) {
      setChats([]);
      setLoading(false);
      return;
    }
    const { data: chars } = await (supabase as any)
      .from("characters")
      .select("id, name, image")
      .in("id", ids);
    const charMap = new Map<string, { name: string; image: string | null }>();
    (chars ?? []).forEach((c: any) => charMap.set(c.id, { name: c.name, image: c.image }));
    localCharacters.forEach((c) => {
      if (!charMap.has(c.id)) charMap.set(c.id, { name: c.name, image: c.image });
    });

    const rows: ChatRow[] = ids.map((id) => {
      const info = byChar.get(id)!;
      const c = charMap.get(id);
      return {
        characterId: id,
        name: c?.name ?? "Unknown",
        image: resolveImage(id, c?.image),
        last: info.last,
        time: timeAgo(info.created_at),
      };
    });
    setChats(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const exitSelect = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startLongPress = (id: string) => {
    if (selectMode) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      setSelectMode(true);
      setSelected(new Set([id]));
    }, 380);
  };

  const cancelLongPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const selectAll = () => setSelected(new Set(chats.map((c) => c.characterId)));

  const deleteSelected = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid || selected.size === 0) return;
    const ids = Array.from(selected);
    await (supabase as any)
      .from("chat_messages")
      .delete()
      .eq("user_id", uid)
      .in("character_id", ids);
    setChats((prev) => prev.filter((c) => !selected.has(c.characterId)));
    exitSelect();
  };

  const deleteAll = async () => {
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return;
    await (supabase as any).from("chat_messages").delete().eq("user_id", uid);
    setChats([]);
    exitSelect();
  };

  const q = query.trim().toLowerCase();
  const visibleChats = q
    ? chats.filter(
        (c) => c.name.toLowerCase().includes(q) || c.last.toLowerCase().includes(q),
      )
    : chats;
  const empty = !loading && chats.length === 0;
  const allSelected = selected.size === chats.length && chats.length > 0;

  return (
    <div className="safe-top">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        {selectMode ? (
          <>
            <div className="flex items-center gap-3">
              <button aria-label="Cancel" onClick={exitSelect} className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
                <X className="h-5 w-5" />
              </button>
              <h1 className="text-lg font-semibold">
                {selected.size === 0 ? "Select chats" : `${selected.size} selected`}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={allSelected ? () => setSelected(new Set()) : selectAll}
                className="rounded-full bg-surface px-3 py-2 text-xs font-semibold"
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
              <button
                aria-label="Delete selected"
                disabled={selected.size === 0}
                onClick={() => setConfirm("selected")}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Chats</h1>
            <div className="flex items-center gap-2">
              <button aria-label="Search chats" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface">
                <Search className="h-5 w-5" />
              </button>
              <button
                aria-label="Select chats"
                disabled={chats.length === 0}
                onClick={() => setSelectMode(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface disabled:opacity-40"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </header>

      {loading ? (
        <div className="px-6 pt-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : empty ? (
        <div className="flex flex-col items-center justify-center px-6 pt-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface">
            <MessageCircle className="h-9 w-9 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No conversations yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">Find a character that catches your eye.</p>
          <Link to="/" className="mt-6 rounded-full gradient-accent px-6 py-3 text-sm font-semibold text-primary-foreground shadow-accent">
            Discover Characters
          </Link>
        </div>
      ) : (
        <>
          <ul className="px-2 pb-4">
            {chats.map((c) => {
              const isSel = selected.has(c.characterId);
              return (
                <li key={c.characterId}>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectMode) toggle(c.characterId);
                      else navigate({ to: "/chat/$id", params: { id: c.characterId } });
                    }}
                    onPointerDown={() => startLongPress(c.characterId)}
                    onPointerUp={cancelLongPress}
                    onPointerLeave={cancelLongPress}
                    onPointerCancel={cancelLongPress}
                    onContextMenu={(e) => e.preventDefault()}
                    className={`flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-left active:bg-surface ${
                      isSel ? "bg-surface" : ""
                    }`}
                  >
                    {selectMode && (
                      <span className="shrink-0">
                        {isSel ? (
                          <CheckCircle2 className="h-6 w-6 text-primary" />
                        ) : (
                          <Circle className="h-6 w-6 text-muted-foreground" />
                        )}
                      </span>
                    )}
                    <img
                      src={c.image}
                      alt={c.name}
                      loading="lazy"
                      className="h-14 w-14 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold">{c.name}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">{c.last}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {selectMode && (
            <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center px-4">
              <button
                onClick={() => setConfirm("all")}
                className="rounded-full bg-surface px-5 py-2.5 text-xs font-semibold text-muted-foreground shadow-lg"
              >
                Delete all conversations
              </button>
            </div>
          )}
        </>
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "all" ? "Delete all conversations?" : `Delete ${selected.size} conversation${selected.size === 1 ? "" : "s"}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the messages from your account. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (confirm === "all") await deleteAll();
                else await deleteSelected();
                setConfirm(null);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
