import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { privacyPolicyHtml } from "@/lib/privacy-policy";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy · Kender" },
      { name: "description", content: "Read the Kender Privacy Policy." },
    ],
  }),
  component: PrivacyPolicyPage,
});

function PrivacyPolicyPage() {
  const navigate = useNavigate();

  return (
    <div className="safe-top min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/95 px-2 py-3 backdrop-blur">
        <button
          onClick={() => navigate({ to: "/settings" })}
          aria-label="Back"
          className="rounded-full p-2 active:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.2em]">KENDER</h1>
        <span className="w-10" />
      </div>

      {/* Content */}
      <main className="px-5 py-6">
        <div
          className="prose prose-invert max-w-none text-sm text-foreground/90"
          dangerouslySetInnerHTML={{ __html: privacyPolicyHtml }}
        />
      </main>
    </div>
  );
}
