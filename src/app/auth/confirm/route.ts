import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Same-site path or full URL in, safe same-site path out. The email templates
 * forward `next` as whatever absolute URL was passed to `emailRedirectTo` (via
 * `{{ .RedirectTo }}`), not a bare path, so both forms need to resolve here —
 * an open redirect on the one route that hands out a session is worth
 * avoiding either way.
 */
function resolveNext(raw: string | null, origin: string): string {
  if (!raw) return "/";

  try {
    const url = new URL(raw, origin);
    return url.origin === origin ? url.pathname + url.search : "/";
  } catch {
    return "/";
  }
}

/**
 * Where the magic link lands. Exchanges the one-time token for a session cookie,
 * then sends the user on.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = resolveNext(searchParams.get("next"), origin);

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL("/login?error=link_invalid", origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    // Expired or already used. Both mean "ask for another one".
    return NextResponse.redirect(new URL("/login?error=link_expired", origin));
  }

  return NextResponse.redirect(new URL(next, origin));
}
