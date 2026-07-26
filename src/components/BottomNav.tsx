import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Search, Plus, MessageCircle, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Item = { to: string; label: string; icon: LucideIcon; accent?: boolean };

const items: Item[] = [
  { to: "/",        label: "Home",   icon: Home },
  { to: "/chats",   label: "Chats",  icon: MessageCircle },
  { to: "/create",  label: "Create", icon: Plus, accent: true },
  { to: "/search",  label: "Search", icon: Search },
  { to: "/profile", label: "Profile",icon: User },
];

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/dm/") ||
    pathname === "/settings" ||
    pathname === "/premium"
  ) return null;


  return (
    <nav
      className="fixed bottom-0 left-0 z-50 w-full border-t border-border bg-background/85 backdrop-blur-xl safe-bottom"
      aria-label="Primary"
    >
      <ul className="mx-auto flex w-full items-center justify-around px-4 py-2">

        {items.map(({ to, label, icon: Icon, accent }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          if (accent) {
            return (
              <li key={to}>
                <Link
                  to={to}
                  aria-label={label}
                  className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full gradient-accent text-primary-foreground shadow-accent transition-transform active:scale-95"
                >
                  <Icon className="h-6 w-6" strokeWidth={2.5} />
                </Link>
              </li>
            );
          }
          return (
            <li key={to}>
              <Link
                to={to}
                aria-label={label}
                className="flex flex-col items-center gap-1 px-3 py-2 transition-colors"
              >
                <Icon
                  className={`h-6 w-6 transition-colors ${active ? "text-foreground" : "text-muted-foreground"}`}
                  strokeWidth={active ? 2.5 : 2}
                />
                <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
