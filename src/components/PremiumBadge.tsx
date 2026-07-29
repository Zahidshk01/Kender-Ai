import { BadgeCheck } from "lucide-react";

/** Gold verified-style badge shown next to Pro members' usernames. */
export function PremiumBadge({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <BadgeCheck
      aria-label="Kender Pro member"
      className={`shrink-0 fill-amber-400 text-black ${className}`}
    />
  );
}
