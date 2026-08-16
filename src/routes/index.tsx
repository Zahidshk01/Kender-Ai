import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { CharacterPost } from "@/components/CharacterPost";
import { charactersQuery } from "@/lib/characters-query";
import { useBlockedTargets } from "@/lib/block-store";
import { useIsPro } from "@/lib/subscription";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kender — Discover AI Characters" },
      {
        name: "description",
        content:
          "An Instagram-style feed of AI characters. Like, share, and chat with them on Kender.",
      },
      { property: "og:title", content: "Kender — Discover AI Characters" },
      {
        property: "og:description",
        content: "An Instagram-style feed of AI characters. Like, share, and chat with them on Kender.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { data: characters = [], isLoading: loading } = useQuery(charactersQuery(true));
  const blocked = useBlockedTargets();
  const isPro = useIsPro();

  const feed = characters.filter((c) => {
    if (c.owner_id && blocked.includes(c.owner_id)) return false;
    const handle = (c.creator ?? "").replace(/^@/, "");
    if (handle && blocked.includes(`h:${handle}`)) return false;
    return true;
  });

  return (
    <div className="safe-top">
      <header className="sticky top-0 z-20 flex items-center justify-center border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl">
        <h1 className="text-lg font-bold tracking-[0.2em] text-white">KENDER</h1>
        <div className="absolute right-4 top-1/2 flex -translate-y-1/2 items-center gap-2">
          {isPro ? (
            <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text px-1 text-xs font-extrabold uppercase tracking-widest text-transparent">
              Premium
            </span>
          ) : (
            <Link
              to="/premium"
              className="rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 text-xs font-bold text-black active:scale-95"
            >
              Get Pro
            </Link>
          )}

          <Link
            to="/notifications"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full bg-surface active:scale-95"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
          </Link>
        </div>
      </header>

      {loading ? (
        <div className="p-4 text-sm text-muted-foreground">Loading characters...</div>
      ) : characters.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground">
          No characters found in Supabase.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {feed.map((c, i) => (
            <div key={`${c.id}-${i}`}>
              <CharacterPost char={c} />
              {/* Free plan shows ads every 4 posts — Pro is ad-free */}
              {!isPro && i > 0 && (i + 1) % 4 === 0 && (
                <Link
                  to="/premium"
                  className="flex items-center justify-between gap-3 border-t border-border/60 bg-surface/60 px-4 py-4 active:opacity-90"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Sponsored
                    </p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      Tired of ads? Go ad-free with Kender Pro.
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 text-xs font-bold text-black">
                    Get Pro
                  </span>
                </Link>
              )}
            </div>
          ))}
        </div>

      )}
    </div>
  );
}