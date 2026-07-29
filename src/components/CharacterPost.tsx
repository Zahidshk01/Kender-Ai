import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { Heart, MessageCircle, Bookmark } from "lucide-react";
import { toast } from "sonner";
import type { Character } from "@/lib/character";
import { toggleSaved, useIsSaved } from "@/lib/saved-store";
import { toggleLiked, useIsLiked } from "@/lib/liked-store";
import { toggleFollow, useIsFollowing } from "@/lib/follow-store";
import { useOwnerProfile } from "@/lib/owner-profile";
import { avatarForHandle } from "@/lib/creator-meta";
import { useChatCount, baseLikeCount } from "@/lib/chat-counts";
import { PremiumBadge } from "@/components/PremiumBadge";


function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

export function CharacterPost({ char }: { char: Character }) {
  const navigate = useNavigate();
  const saved = useIsSaved(char.id);
  const liked = useIsLiked(char.id);
  const following = useIsFollowing(char.creator);
  const [likeDelta, setLikeDelta] = useState(0);
  const likes = baseLikeCount(char.id) + likeDelta;
  const comments = useChatCount(char.id);


  const toggleLike = async () => {
    const nowLiked = await toggleLiked(char.id);
    setLikeDelta((n) => n + (nowLiked ? 1 : -1));
  };

  const onSave = async () => {
    const nowSaved = await toggleSaved(char.id);
    toast.success(nowSaved ? "Saved to your profile" : "Removed from your profile");
  };

  const toggleFollowClick = async () => {
    if (!char.creator) return;
    const nowFollowing = await toggleFollow(char.creator);
    toast.success(nowFollowing ? `Following ${char.creator}` : `Unfollowed ${char.creator}`);
  };

  const openChat = () => navigate({ to: "/chat/$id", params: { id: char.id } });

  const ownerProfile = useOwnerProfile(char.owner_id ?? null);
  const fallbackLabel = (char.creator ?? "unknown").replace(/^@/, "");
  const displayLabel = ownerProfile?.username || fallbackLabel;
  const creatorInitial = displayLabel.charAt(0).toUpperCase();
  const avatarUrl = ownerProfile?.avatar_url || avatarForHandle(char.creator);

  return (
    <article className="animate-pop-in pb-4">
      <header className="flex items-center justify-between px-4 py-2.5">
        <Link
          to="/u/$userId"
          params={{ userId: char.owner_id ?? `h:${fallbackLabel}` }}
          className="flex min-w-0 items-center gap-3 active:opacity-70"
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayLabel}
              className="h-9 w-9 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-foreground">
              {creatorInitial}
            </div>
          )}
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-semibold">{displayLabel}</span>
            {ownerProfile?.is_pro && <PremiumBadge />}
          </span>
        </Link>


        <button
          onClick={toggleFollowClick}
          className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
            following
              ? "border-border bg-surface text-muted-foreground"
              : "border-border bg-transparent text-foreground active:scale-95"
          }`}
        >
          {following ? "Following" : "Follow"}
        </button>
      </header>

      <button
        onDoubleClick={toggleLike}
        onClick={openChat}
        className="relative block w-full overflow-hidden bg-surface"
        aria-label={`Chat with ${char.name}`}
      >
        <img
          src={char.image ?? "/placeholder.png"}
          alt={char.name}
          className="aspect-[4/5] w-full object-cover"
          loading="lazy"
        />
        <span className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md bg-background/70 backdrop-blur-md">
          <MessageCircle className="h-5 w-5 fill-foreground text-foreground" />
        </span>
      </button>

      <div className="flex items-center gap-5 px-4 pt-3">
        <button onClick={toggleLike} className="flex items-center gap-2 active:scale-95">
          <Heart className={`h-6 w-6 transition-colors ${liked ? "fill-primary text-primary" : "text-foreground"}`} />
          <span className="text-sm font-semibold">{fmt(likes)}</span>
        </button>
        <button onClick={openChat} className="flex items-center gap-2 active:scale-95">
          <MessageCircle className="h-6 w-6" />
          <span className="text-sm font-semibold tabular-nums">{fmt(comments)}</span>
        </button>
        <button
          onClick={onSave}
          aria-label="Save"
          className="ml-auto flex h-9 w-9 items-center justify-center active:scale-95"
        >
          <Bookmark className={`h-6 w-6 ${saved ? "fill-primary text-primary" : "text-foreground"}`} />
        </button>
      </div>

      <div className="px-4 pt-1.5">
        <p className="text-sm leading-snug">
          <span className="font-semibold">{char.name}</span>
          <span className="text-muted-foreground"> ({char.relation})</span>
          <span className="text-foreground/90">  {char.tagline} </span>
          <button onClick={openChat} className="text-muted-foreground active:opacity-70">…more</button>
        </p>
      </div>
    </article>
  );
}
