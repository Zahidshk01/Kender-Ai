import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, MessageSquare, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Character } from "@/lib/character";
import { resolveImage } from "@/lib/character-images";
import { useBlockedTargets } from "@/lib/block-store";
import { PremiumBadge } from "@/components/PremiumBadge";

type UserRow = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  is_pro: boolean | null;
  pro_until: string | null;
};

export const Route = createFileRoute("/search")({
  head: () => ({
    meta: [
      { title: "Search · Kender" },
      { name: "description", content: "Browse and search every character on Kender." },
    ],
  }),
  component: SearchPage,
});

function SearchPage() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Character[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const blocked = useBlockedTargets();

  useEffect(() => {
    const term = q.trim().replace(/^@/, "");
    if (!term) {
      setUsers([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, username, avatar_url, is_pro, pro_until")
        .ilike("username", `%${term}%`)
        .limit(20);
      if (!cancelled) setUsers((data as UserRow[]) ?? []);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q]);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("characters")
        .select("*")
        .order("sort_order", { ascending: true });
      if (data) {
        setItems(
          (data as Character[]).map((c) => ({ ...c, image: resolveImage(c.id, c.image) })),
        );
      }
    })();
  }, []);

  const results = items.filter((c) => {
    if (c.owner_id && blocked.includes(c.owner_id)) return false;
    const handle = (c.creator ?? "").replace(/^@/, "");
    if (handle && blocked.includes(`h:${handle}`)) return false;
    return (
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      (c.creator ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (c.category ?? "").toLowerCase().includes(q.toLowerCase()) ||
      (c.relation ?? "").toLowerCase().includes(q.toLowerCase())
    );
  });

  const userResults = users.filter((u) => !blocked.includes(u.id));

  return (
    <div className="safe-top pb-8">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 px-4 pt-3 pb-3 backdrop-blur-xl">
        <div className="flex items-center justify-center pb-3">
          <h1 className="text-lg font-bold tracking-[0.2em] text-white">KENDER</h1>
        </div>
        <label className="relative flex h-12 items-center rounded-full bg-surface px-4">
          <Search className="h-5 w-5 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="ml-3 h-full flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search anything..."
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear">
              <X className="h-5 w-5 text-muted-foreground" />
            </button>
          )}
        </label>
      </header>

      {userResults.length > 0 && (
        <section className="px-4 pt-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            People
          </h2>
          <div className="overflow-hidden rounded-2xl bg-surface">
            {userResults.map((u) => {
              const name = (u.username ?? "user").replace(/^@/, "");
              const pro =
                Boolean(u.is_pro) &&
                (!u.pro_until || new Date(u.pro_until).getTime() > Date.now());
              return (
                <Link
                  key={u.id}
                  to="/u/$userId"
                  params={{ userId: u.id }}
                  className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 active:opacity-70"
                >
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={name} className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background text-sm font-bold">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-sm font-semibold">@{name}</span>
                    {pro && <PremiumBadge />}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {results.length ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {results.map((c) => (
            <Link
              key={c.id}
              to="/chat/$id"
              params={{ id: c.id }}
              className="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface transition-transform active:scale-[0.98]"
            >
              <img
                src={c.image ?? "/placeholder.png"}
                alt={c.name}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
              <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-background/60 backdrop-blur-md">
                <MessageSquare className="h-4 w-4 text-white" />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <h3 className="line-clamp-1 text-sm font-semibold text-white">
                  {c.name}
                </h3>
                {c.relation && (
                  <p className="line-clamp-1 text-xs text-white/70">{c.relation}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        userResults.length === 0 && (
          <p className="px-4 py-12 text-center text-sm text-muted-foreground">No results for "{q}"</p>
        )
      )}
    </div>
  );
}
