import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, MoreVertical, Flag, Ban, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  toggleFollowUser, isFollowingUser, getUserFollowCounts,
  getFollowersOfUser, getFollowingOfUser, type FollowListEntry,
} from "@/lib/user-follow";
import { refreshFollows, toggleFollow, useIsFollowing } from "@/lib/follow-store";
import { characters as localCharacters } from "@/lib/mock-data";
import { useChatCount, baseChatCount } from "@/lib/chat-counts";
import { avatarForHandle, bioForHandle } from "@/lib/creator-meta";
import { PremiumBadge } from "@/components/PremiumBadge";
import { baselineFollowCounts } from "@/lib/follow-baseline";
import { blockTarget, reportTarget, useBlockedTargets } from "@/lib/block-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/u/$userId")({
  component: UserProfilePage,
});

const imageById = new Map(localCharacters.map((c) => [c.id, c.image]));

type CharRow = {
  id: string;
  name: string;
  image: string | null;
};

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(2).replace(/\.?0+$/, "") + "K";
  return String(n);
}

function UserProfilePage() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [profile, setProfile] = useState<{ username: string | null; avatar_url: string | null; bio: string | null; is_pro?: boolean; pro_until?: string | null } | null>(null);
  const [chars, setChars] = useState<CharRow[]>([]);
  const [totalChats, setTotalChats] = useState(0);
  const [counts, setCounts] = useState({ followers: 0, following: 0 });
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);

  const isHandle = userId.startsWith("h:");
  const handle = isHandle ? userId.slice(2) : null;

  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      setMe(s.session?.user.id ?? null);

      if (isHandle && handle) {
        // Synthetic profile for seeded characters (no real user account)
        const { data: charData } = await (supabase as any)
          .from("characters")
          .select("id, name, image, chats")
          .or(`creator.eq.@${handle},creator.eq.${handle}`)
          .order("sort_order", { ascending: true });
        const rows: any[] = charData ?? [];
        setProfile({ username: handle, avatar_url: avatarForHandle(handle), bio: bioForHandle(handle) });
        setChars(rows.map((c) => ({ id: c.id, name: c.name, image: c.image || imageById.get(c.id) || null })));
        const sum = rows.reduce((acc, c) => acc + baseChatCount(c.id), 0);
        setTotalChats(sum);
        setCounts(baselineFollowCounts("h:" + handle));
        return;
      }

      const [{ data: prof }, { data: charData }, cnts, isF] = await Promise.all([
        (supabase as any).from("profiles").select("username, avatar_url, bio, is_pro, pro_until").eq("id", userId).maybeSingle(),
        (supabase as any)
          .from("characters")
          .select("id, name, image, chats")
          .eq("owner_id", userId)
          .order("sort_order", { ascending: true }),
        getUserFollowCounts(userId),
        isFollowingUser(userId),
      ]);

      setProfile(prof ?? { username: null, avatar_url: null, bio: null });
      const rows: any[] = charData ?? [];
      setChars(
        rows.map((c) => ({
          id: c.id,
          name: c.name,
          image: c.image || imageById.get(c.id) || null,
        })),
      );
      const sum = rows.reduce((acc, c) => acc + baseChatCount(c.id), 0);
      setTotalChats(sum);
      setCounts(cnts);
      setFollowing(isF);
    })();
  }, [userId, isHandle, handle]);

  const handleFollowingState = useIsFollowing(handle ?? null);

  // Re-fetch counts whenever a follow/unfollow happens anywhere in the app
  useEffect(() => {
    if (isHandle) return;
    const refetch = () => {
      getUserFollowCounts(userId).then(setCounts).catch(() => {});
    };
    window.addEventListener("kender:follows-changed", refetch);
    return () => window.removeEventListener("kender:follows-changed", refetch);
  }, [userId, isHandle]);

  const onToggleFollow = async () => {
    if (!me) {
      toast.error("Sign in to follow");
      return;
    }
    if (busy) return;
    if (isHandle) {
      if (!handle) return;
      setBusy(true);
      try {
        const nowFollowing = await toggleFollow(handle);
        setCounts((c) => ({ ...c, followers: c.followers + (nowFollowing ? 1 : -1) }));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (me === userId) return;
    setBusy(true);
    try {
      const now = await toggleFollowUser(userId);
      setFollowing(now);
      const fresh = await getUserFollowCounts(userId);
      setCounts(fresh);
      await refreshFollows();
    } finally {
      setBusy(false);
    }
  };

  const displayName = profile?.username || (isHandle ? handle! : "user");
  const initial = displayName.charAt(0).toUpperCase();
  const isProProfile =
    Boolean(profile?.is_pro) &&
    (!profile?.pro_until || new Date(profile.pro_until).getTime() > Date.now());

  const isSelf = me === userId;
  const targetKey = isHandle ? `h:${handle}` : userId;
  const blocked = useBlockedTargets();

  const [reportOpen, setReportOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [listDialog, setListDialog] = useState<null | "followers" | "following">(null);

  // If already blocked, redirect away
  useEffect(() => {
    if (!isSelf && blocked.includes(targetKey)) {
      navigate({ to: "/" });
    }
  }, [blocked, targetKey, isSelf, navigate]);

  const onBlock = async () => {
    await blockTarget(targetKey);
    setConfirmBlock(false);
    toast.success(`Blocked ${displayName}`);
    navigate({ to: "/" });
  };

  const onSubmitReport = async () => {
    if (!reportReason) {
      toast.error("Pick a reason");
      return;
    }
    await reportTarget(targetKey, reportReason, reportDetails || undefined);
    setReportOpen(false);
    setReportReason("");
    setReportDetails("");
    toast.success("Report submitted. Thank you.");
  };

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-background/90 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate({ to: "/" })} className="active:scale-95" aria-label="Back">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <h1 className="flex items-center gap-1.5 text-lg font-semibold">
            {displayName}
            {isProProfile && <PremiumBadge className="h-4.5 w-4.5" />}
          </h1>
        </div>
        {!isSelf ? (
          <Popover>
            <PopoverTrigger asChild>
              <button className="flex h-9 w-9 items-center justify-center rounded-full bg-surface active:scale-95" aria-label="More">
                <MoreVertical className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-44 p-1">
              <button
                onClick={() => setReportOpen(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm active:bg-surface"
              >
                <Flag className="h-4 w-4" /> Report
              </button>
              <button
                onClick={() => setConfirmBlock(true)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-orange-400 active:bg-surface"
              >
                <Ban className="h-4 w-4" /> Block
              </button>
            </PopoverContent>
          </Popover>
        ) : (
          <div className="h-9 w-9" />
        )}
      </header>

      {/* Report dialog */}
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report {displayName}</DialogTitle>
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
            <DialogTitle>Block {displayName}?</DialogTitle>
            <DialogDescription>
              You won't see their profile or characters. You can unblock from Settings.
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


      <section className="px-4 pt-2">
        <div className="flex items-center gap-4">
          {profile?.avatar_url ? (
            <img src={profile.avatar_url} alt={displayName} className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-surface text-2xl font-bold">
              {initial}
            </div>
          )}
          <div className="flex flex-1 items-center justify-around">
            <Stat
              value={fmt(counts.followers)}
              label="FOLLOWERS"
              onClick={isHandle ? undefined : () => setListDialog("followers")}
            />
            <Stat
              value={fmt(counts.following)}
              label="FOLLOWING"
              onClick={isHandle ? undefined : () => setListDialog("following")}
            />
            <Stat value={fmt(totalChats)} label="CHATS" />

          </div>
        </div>

        {profile?.bio ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{profile.bio}</p>
        ) : null}

        {!isSelf && (
          <div className={`mt-4 grid gap-3 ${isHandle ? "grid-cols-1" : "grid-cols-2"}`}>
            <button
              onClick={onToggleFollow}
              disabled={busy}
              aria-busy={busy}
              className={`flex h-11 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors active:scale-[0.98] disabled:opacity-70 ${
                (isHandle ? handleFollowingState : following)
                  ? "bg-surface text-foreground"
                  : "bg-primary text-primary-foreground"
              }`}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {(isHandle ? handleFollowingState : following) ? "Unfollowing…" : "Following…"}
                </>
              ) : (isHandle ? handleFollowingState : following) ? (
                "Following"
              ) : (
                "Follow"
              )}
            </button>
            {!isHandle && (
              <button
                onClick={() => navigate({ to: "/dm/$userId", params: { userId } })}
                className="h-11 rounded-2xl bg-surface text-sm font-semibold active:scale-[0.98]"
              >
                Message
              </button>
            )}
          </div>
        )}
      </section>

      <UserFollowListDialog
        open={listDialog !== null}
        kind={listDialog}
        userId={userId}
        onClose={() => setListDialog(null)}
      />



      <section className="mt-3 grid grid-cols-2 gap-0.5">
        {chars.map((c) => (
          <Link
            key={c.id}
            to="/chat/$id"
            params={{ id: c.id }}
            className="relative block aspect-[4/5] overflow-hidden bg-surface active:opacity-80"
          >
            {c.image ? (
              <img src={c.image} alt={c.name} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">{c.name}</div>
            )}
            <CharChatBadge id={c.id} />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
              <p className="text-sm font-semibold leading-tight text-white">{c.name}</p>
            </div>
          </Link>
        ))}
        {chars.length === 0 && (
          <div className="col-span-2 py-12 text-center text-sm text-muted-foreground">
            No characters yet
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  value,
  label,
  onClick,
}: {
  value: string;
  label: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[10px] font-medium tracking-wider text-muted-foreground">{label}</div>
    </>
  );
  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-lg px-2 py-1 text-center active:bg-surface">
        {inner}
      </button>
    );
  }
  return <div className="text-center">{inner}</div>;
}

function UserFollowListDialog({
  open,
  kind,
  userId,
  onClose,
}: {
  open: boolean;
  kind: "followers" | "following" | null;
  userId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<FollowListEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !kind) return;
    let cancelled = false;
    setLoading(true);
    const p = kind === "followers" ? getFollowersOfUser(userId) : getFollowingOfUser(userId);
    p.then((rows) => {
      if (!cancelled) setEntries(rows);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, kind, userId]);

  const title = kind === "followers" ? "Followers" : "Following";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {loading
              ? "Loading…"
              : entries.length === 0
                ? kind === "followers"
                  ? "No followers yet."
                  : "Not following anyone yet."
                : `${entries.length} ${entries.length === 1 ? "person" : "people"}`}
          </DialogDescription>
        </DialogHeader>
        {!loading && entries.length > 0 && (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {entries.map((e) => (
              <button
                key={e.id}
                onClick={() => {
                  onClose();
                  navigate({ to: "/u/$userId", params: { userId: e.id } });
                }}
                className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left active:bg-surface"
              >
                {e.avatar_url ? (
                  <img src={e.avatar_url} alt={e.username} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-sm font-bold">
                    {e.username.replace(/^@/, "").slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {e.username.startsWith("@") ? e.username : `@${e.username}`}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CharChatBadge({ id }: { id: string }) {
  const n = useChatCount(id);
  const f = (v: number) =>
    v >= 1_000_000 ? (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M"
    : v >= 1_000 ? (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K"
    : String(v);
  return (
    <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/70 px-1.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur-md">
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {f(n)}
    </span>
  );
}
