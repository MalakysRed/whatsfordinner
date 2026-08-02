"use client";

import { useOnlineStatus } from "@/lib/pwa/use-online-status";

/**
 * Zero footprint when online — only mounts visible content once actually
 * offline, so this never adds a screen in front of the fast path. Says
 * plainly what still works (PRD 13): generation needs a connection, the
 * book/bank/shopping list don't.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <div
      role="status"
      className="border-b border-line bg-raised px-5 py-2 text-center text-sm text-muted"
    >
      You&rsquo;re offline — the book, bank and shopping list still work.
      New suggestions need a connection.
    </div>
  );
}
