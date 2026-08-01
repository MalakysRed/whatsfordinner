import Link from "next/link";
import type { ReactNode } from "react";
import { requireHouseholdSession } from "@/lib/auth/session";

/**
 * Shell for the signed-in app. Navigation sits at the bottom because this is
 * used one-handed, standing up, and the top of a phone is not where a thumb is.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  // Bounces to /login or /welcome as appropriate. The proxy does this too; this
  // is the check that actually counts, since a matcher change cannot remove it.
  await requireHouseholdSession();

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-md flex-1 px-5 pb-28 pt-6">{children}</div>

      <nav className="fixed inset-x-0 bottom-0 border-t border-line bg-raised/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-stretch justify-around pb-[env(safe-area-inset-bottom)]">
          <NavLink href="/" label="Dinner" />
          <NavLink href="/ingredients" label="Bank" />
          <NavLink href="/settings" label="Settings" />
        </div>
      </nav>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 flex-1 items-center justify-center text-sm font-medium text-muted"
    >
      {label}
    </Link>
  );
}
