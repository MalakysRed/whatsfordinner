import type { ReactNode } from "react";
import { requireDevSession } from "@/lib/auth/dev";

/**
 * The hidden dev-tools shell — no bottom nav, not part of the (app) route
 * group. Nothing links here; you type the URL. requireDevSession() 404s
 * anyone whose users.is_dev isn't set.
 */
export default async function DevLayout({ children }: { children: ReactNode }) {
  await requireDevSession();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 py-8">
      {children}
    </main>
  );
}
