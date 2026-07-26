import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { termsOfServiceHtml } from "@/lib/terms-of-service";

export const Route = createFileRoute("/terms-of-service")({
  head: () => ({
    meta: [
      { title: "Terms of Service · Kender" },
      { name: "description", content: "Read the Kender Terms of Service." },
      { property: "og:title", content: "Terms of Service · Kender" },
      { property: "og:description", content: "Read the Kender Terms of Service." },
    ],
  }),
  component: TermsOfServicePage,
});

function TermsOfServicePage() {
  return (
    <div className="safe-top min-h-screen bg-background">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border/40 bg-background/95 px-2 py-3 backdrop-blur">
        <button
          onClick={() => window.history.back()}
          aria-label="Back"
          className="rounded-full p-2 active:bg-surface"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold tracking-[0.2em]">KENDER</h1>
        <span className="w-10" />
      </div>

      <main className="px-5 py-6 pb-28">
        <div
          className="privacy-policy prose prose-invert max-w-none text-sm text-foreground/90"
          dangerouslySetInnerHTML={{ __html: termsOfServiceHtml }}
        />
      </main>
      <style>{`
        .privacy-policy h1,
        .privacy-policy h2,
        .privacy-policy h3,
        .privacy-policy strong {
          color: var(--foreground);
        }
        .privacy-policy a {
          color: var(--primary);
          text-decoration: underline;
        }
        .privacy-policy ul {
          list-style: disc;
          padding-left: 1.25rem;
          margin-bottom: 1rem;
        }
        .privacy-policy p,
        .privacy-policy li {
          margin-bottom: 0.75rem;
        }
      `}</style>
    </div>
  );
}
