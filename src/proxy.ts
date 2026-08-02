import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session cookie on every request, and bounces signed-out
 * visitors to the login page.
 *
 * This is convenience, not security. Next.js warns that a matcher change or a
 * refactor can silently remove proxy coverage, so every route handler and server
 * action checks auth for itself, and RLS backs both of them up.
 *
 * (`proxy` is what Next.js 16 calls what used to be `middleware`.)
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() rather than getSession(): it revalidates the token with Supabase
  // instead of trusting whatever the cookie claims.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute =
    pathname.startsWith("/login") || pathname.startsWith("/auth");

  if (!user && !isPublicRoute) {
    const loginUrl = new URL("/login", request.url);
    // Come back to where they were headed once they have signed in — an invite
    // link that dumps you on the home page has lost the invite.
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets, image optimisation, and the PWA shell
    // (sw.js, the offline fallback). Without this the redirect above would
    // also catch CSS and JS — and would redirect the service worker itself
    // and the page it falls back to when offline, which must both be
    // reachable signed out.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|offline|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
