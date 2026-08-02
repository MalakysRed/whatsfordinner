import Link from "next/link";

/**
 * Shown by the service worker when a navigation fails with no cached page to
 * fall back to (public/sw.js). Deliberately outside the (app) route group:
 * that layout's session check needs a network round trip, and this page has
 * to render from the cache alone with none available.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You&rsquo;re offline</h1>
      <p className="max-w-xs text-base leading-relaxed text-muted">
        This page hasn&rsquo;t been opened before, so there&rsquo;s nothing saved to show.
        Your recipe book, ingredient bank and shopping list stay readable
        offline once you&rsquo;ve visited them — everything else needs a
        connection.
      </p>
      <Link
        href="/"
        className="min-h-11 rounded-xl bg-accent px-5 py-3 text-base font-medium text-on-accent"
      >
        Try again
      </Link>
    </div>
  );
}
