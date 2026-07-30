import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft, ChevronRight, Mail, FileText, ShieldCheck, Info, LogOut, Trash2, BadgeCheck, ShieldOff, Crown, AlertTriangle,
} from "lucide-react";
import { useSubscription } from "@/lib/subscription";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount, getDeletionSummary } from "@/lib/account.functions";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBlockedTargets, unblockTarget } from "@/lib/block-store";
import { avatarForHandle } from "@/lib/creator-meta";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Kender" },
      { name: "description", content: "Manage your Kender account preferences." },
    ],
  }),
  component: SettingsPage,
});

const APP_VERSION = "v2.4.1";

function SettingsPage() {
  const navigate = useNavigate();
  const [infoDialog, setInfoDialog] = useState<null | "contact" | "terms" | "version" | "blocked">(null);
  const { isPro } = useSubscription();
  const [confirm, setConfirm] = useState<null | "signout" | "delete1" | "delete2">(null);
  const [summary, setSummary] = useState<{ characterCount: number; isPro: boolean; plan: string | null; currentPeriodEnd: string | null } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const fetchSummary = useServerFn(getDeletionSummary);
  const runDelete = useServerFn(deleteMyAccount);

  useEffect(() => {
    if (confirm !== "delete1") return;
    setSummary(null);
    fetchSummary({} as never)
      .then((s: any) => setSummary(s))
      .catch(() => setSummary(null));
  }, [confirm, fetchSummary]);

  async function handleSignOut() {
    try { await supabase.auth.signOut(); } catch {}
    toast("Signed out");
    navigate({ to: "/" });
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await runDelete({} as never);
      try { await supabase.auth.signOut(); } catch {}
      try {
        localStorage.removeItem("kender.profile");
        localStorage.removeItem("kender.saved");
        localStorage.removeItem("kender.liked");
      } catch {}
      setConfirm(null);
      toast("Your account has been permanently deleted");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete account");
    } finally {
      setDeleting(false);
    }
  }


  return (
    <div className="safe-top min-h-screen bg-background pb-16">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 pt-3">
        <button
          onClick={() => navigate({ to: "/profile" })}
          aria-label="Back"
          className="rounded-full p-2 active:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Settings</h1>
      </div>

      {/* Premium card */}
      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-surface">
        <Link
          to="/premium"
          className="flex w-full items-center gap-3 px-4 py-3.5 active:bg-surface-2"
        >
          <BadgeCheck className="h-5 w-5 text-amber-400" />
          <span className="flex-1" />
          <span className="rounded-full bg-gradient-to-r from-amber-400 to-amber-600 px-3 py-1 text-xs font-bold text-black">
            Get Premium
          </span>
        </Link>
      </div>

      {/* Menu card */}
      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-surface">
        <Row
          icon={<Crown className="h-5 w-5 text-foreground/80" />}
          label="Plan"
          right={
            isPro ? (
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600 bg-clip-text text-sm font-bold text-transparent">
                Premium
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Free</span>
            )
          }
          onClick={() => navigate({ to: "/premium" })}
        />
        <Row
          icon={<Mail className="h-5 w-5 text-foreground/80" />}
          label="Contact Us"
          onClick={() => setInfoDialog("contact")}
        />

        <Row
          icon={<FileText className="h-5 w-5 text-foreground/80" />}
          label="Terms of Service"
          onClick={() => navigate({ to: "/terms-of-service" })}
        />
        <Row
          icon={<ShieldCheck className="h-5 w-5 text-foreground/80" />}
          label="Privacy Policy"
          onClick={() => navigate({ to: "/privacy-policy" })}
        />
        <Row
          icon={<ShieldOff className="h-5 w-5 text-foreground/80" />}
          label="Blocked Users"
          onClick={() => setInfoDialog("blocked")}
          isLast
        />
      </div>

      {/* Account card */}
      <div className="mx-4 mt-4 overflow-hidden rounded-2xl bg-surface">
        <Row
          icon={<Info className="h-5 w-5 text-foreground/80" />}
          label="App Version"
          right={<span className="text-xs text-muted-foreground">{APP_VERSION}</span>}
          hideChevron
        />
        <Row
          icon={<LogOut className="h-5 w-5 text-red-500" />}
          label="Sign Out"
          labelClass="text-red-500"
          onClick={() => setConfirm("signout")}
          hideChevron
        />
        <Row
          icon={<Trash2 className="h-5 w-5 text-red-500" />}
          label="Delete Account"
          labelClass="text-red-500"
          onClick={() => { setConfirmText(""); setConfirm("delete1"); }}
          hideChevron
          isLast
        />
      </div>

      <InfoDialog open={infoDialog === "contact"} onClose={() => setInfoDialog(null)} title="Contact Us"
        body={<p>Questions, feedback or issues? Email us at{" "}
          <a href="mailto:support@kender.app" className="text-primary underline">support@kender.app</a>.</p>} />
      <InfoDialog open={infoDialog === "terms"} onClose={() => setInfoDialog(null)} title="Terms of Service"
        body={<p>By using Kender you agree to use the app respectfully. Characters are fictional. Do not share content that violates laws or the rights of others. Full terms coming soon.</p>} />
      <InfoDialog open={infoDialog === "version"} onClose={() => setInfoDialog(null)} title="App Version"
        body={<p>Kender {APP_VERSION}</p>} />

      <Dialog open={infoDialog === "blocked"} onOpenChange={(o) => !o && setInfoDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Blocked Users</DialogTitle>
            <DialogDescription>People you've blocked won't appear in your feed or search.</DialogDescription>
          </DialogHeader>
          <BlockedList />
        </DialogContent>
      </Dialog>

      <Dialog open={confirm === "signout"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>You'll need to sign back in to chat.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button onClick={() => setConfirm(null)} className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold">Cancel</button>
            <button onClick={() => { setConfirm(null); handleSignOut(); }} className="flex-1 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white">Sign out</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 1 — what will be deleted */}
      <Dialog open={confirm === "delete1"} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Please read what happens before you continue.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2 text-sm text-foreground/90">
            <li className="flex gap-2">
              <span className="text-orange-400">•</span>
              <span>
                All characters you created{summary ? ` (${summary.characterCount})` : ""} will be permanently deleted
                and removed from Home and Search for everyone.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-orange-400">•</span>
              <span>Your profile, chats, messages, likes, saves and followers will be erased.</span>
            </li>
            {(summary?.isPro ?? isPro) && (
              <li className="flex gap-2">
                <span className="text-amber-400">•</span>
                <span>
                  Your <span className="font-semibold text-amber-400">Kender Premium</span> subscription
                  {summary?.plan ? ` (${summary.plan})` : ""} will be cancelled and deleted
                  {summary?.currentPeriodEnd
                    ? ` — you lose the time remaining until ${new Date(summary.currentPeriodEnd).toLocaleDateString()}`
                    : ""}
                  . No refunds are issued.
                </span>
              </li>
            )}
            <li className="flex gap-2">
              <span className="text-orange-400">•</span>
              <span>If you sign in again with the same email, Google or Apple account, you'll start a brand-new account with no history.</span>
            </li>
          </ul>
          <DialogFooter className="gap-2 sm:gap-2">
            <button onClick={() => setConfirm(null)} className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold">Keep account</button>
            <button onClick={() => { setConfirmText(""); setConfirm("delete2"); }} className="flex-1 rounded-full bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white">Continue</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2 — final confirmation */}
      <Dialog open={confirm === "delete2"} onOpenChange={(o) => !o && !deleting && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" /> Are you absolutely sure?
            </DialogTitle>
            <DialogDescription>
              This is permanent and can't be undone. Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            aria-label="Type DELETE to confirm"
            className="w-full rounded-2xl bg-surface-2 px-4 py-3 text-sm outline-none ring-1 ring-border/50 focus:ring-red-500"
          />
          <DialogFooter className="gap-2 sm:gap-2">
            <button disabled={deleting} onClick={() => setConfirm("delete1")} className="flex-1 rounded-full bg-surface px-4 py-2.5 text-sm font-semibold disabled:opacity-50">Back</button>
            <button
              disabled={deleting || confirmText.trim().toUpperCase() !== "DELETE"}
              onClick={handleDelete}
              className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete forever"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({
  icon, label, right, onClick, labelClass, hideChevron, isLast,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
  onClick?: () => void;
  labelClass?: string;
  hideChevron?: boolean;
  isLast?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-surface-2 ${!isLast ? "border-b border-border/40" : ""}`}
    >
      {icon}
      <span className={`flex-1 text-sm ${labelClass ?? "text-foreground"}`}>{label}</span>
      {right}
      {!hideChevron && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
    </button>
  );
}

function InfoDialog({ open, onClose, title, body }: { open: boolean; onClose: () => void; title: string; body: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-foreground/90">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

function BlockedList() {
  const blocked = useBlockedTargets();
  if (blocked.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No blocked users.</p>;
  }
  return (
    <ul className="max-h-80 space-y-2 overflow-y-auto">
      {blocked.map((handle) => (
        <li key={handle} className="flex items-center gap-3 rounded-xl bg-surface-2 p-2">
          <img src={avatarForHandle(handle) ?? undefined} alt={handle} className="h-9 w-9 rounded-full bg-surface object-cover" />
          <span className="flex-1 text-sm">{handle}</span>
          <button
            onClick={() => unblockTarget(handle)}
            className="rounded-full bg-surface px-3 py-1 text-xs font-semibold"
          >
            Unblock
          </button>
        </li>
      ))}
    </ul>
  );
}
