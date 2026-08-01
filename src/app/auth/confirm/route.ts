import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Where the magic link lands. Exchanges the one-time token for a session cookie,
 * then sends the user on.
 *
 * `next` is validated as a same-site path before being used — an open redirect
 * on the one route that hands out a session is worth avoiding.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");

  const next =
    requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/";

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
