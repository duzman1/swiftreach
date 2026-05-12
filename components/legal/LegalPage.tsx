// Public legal-document layout. Used by /terms and /privacy. Renders the
// SwiftReach header + sticky TOC sidebar (desktop) / inline TOC (mobile)
// + the article body + a minimal footer that cross-links the two pages.
//
// This is a server component — both legal pages are static-renderable
// once Next sees them. We intentionally don't pull in any auth wrappers
// here; middleware.ts whitelists /terms and /privacy as public routes.

import Link from "next/link";
import { MessageCircle } from "lucide-react";

export interface Section {
  id: string;
  number: number;
  title: string;
}

interface LegalPageProps {
  title: string;
  lastUpdated: string;
  intro?: React.ReactNode;
  sections: Section[];
  children: React.ReactNode;
}

export function LegalPage({
  title,
  lastUpdated,
  intro,
  sections,
  children,
}: LegalPageProps) {
  return (
    <div className="min-h-screen flex flex-col bg-white text-zinc-900">
      {/* Header — same brand mark as the landing page */}
      <header className="px-6 md:px-10 py-5 border-b border-zinc-200 bg-white">
        <div className="max-w-6xl mx-auto w-full flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <div className="bg-whatsapp rounded-lg p-2">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">SwiftReach</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/sign-in"
              className="px-3 py-1.5 rounded-md text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Main: 2-column on desktop (TOC sidebar + content). On mobile the TOC
          renders inline above the content so anchor links still work. */}
      <main className="flex-1 px-6 md:px-10 py-10">
        <div className="max-w-6xl mx-auto w-full">
          <div className="mb-8">
            <span className="inline-block px-3 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-medium">
              Last updated: {lastUpdated}
            </span>
            <h1 className="mt-4 text-3xl md:text-4xl font-bold tracking-tight">
              {title}
            </h1>
            {intro && (
              <div className="mt-4 text-zinc-700 leading-relaxed">{intro}</div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-10">
            {/* TOC — sticky on lg+, inline on mobile */}
            <aside className="lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-3">
                  Contents
                </div>
                <ol className="space-y-2 text-sm">
                  {sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="text-zinc-700 hover:text-whatsapp hover:underline underline-offset-2 transition-colors"
                      >
                        {s.number}. {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>

            {/* Body — generous line-height + clear hierarchy. The content
                pages themselves render <Section> children that match the
                TOC anchor IDs. */}
            <article className="prose-legal max-w-none text-zinc-700 leading-[1.7] text-[15px] md:text-base space-y-10">
              {children}
            </article>
          </div>
        </div>
      </main>

      {/* Footer — cross-links the two legal pages so visitors can hop. */}
      <footer className="px-6 md:px-10 py-6 border-t border-zinc-200 bg-white text-sm text-zinc-500">
        <div className="max-w-6xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-3">
          <div>© 2026 SwiftReach</div>
          <nav className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-zinc-900 transition-colors">
              Privacy Policy
            </Link>
            <span className="text-zinc-300">·</span>
            <Link href="/terms" className="hover:text-zinc-900 transition-colors">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// Section wrapper used by the content pages so headings consistently match
// the TOC anchor ids. Keeps content pages readable without re-typing the
// same heading scaffolding 13 times.
export function LegalSection({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl md:text-2xl font-semibold text-zinc-900 mb-3">
        {number}. {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
