"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message?: string;
}

/**
 * Sends a magic link, but only to an address that is allowed to have an account.
 *
 * The database trigger is the real gate — it refuses the signup even if someone
 * calls Supabase directly. This check exists so we do not email a link that
 * would fail on arrival.
 *
 * The response is deliberately the same whether or not the email is allowed. The
 * PRD's privacy line ("a record of what two people eat, and it does not need to
 * be anyone else's business") argues against letting a public form confirm
 * whether a given person has an account here.
 */
export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  const next = String(formData.get("next") ?? "");

  if (!email || !email.includes("@")) {
    return { status: "error", message: "That does not look like an email address." };
  }

  const genericSuccess: LoginState = {
    status: "sent",
    message: "If that address is invited, a sign-in link is on its way.",
  };

  let allowed = false;

  try {
    const admin = createAdminClient();

    const [{ data: allowlisted }, { data: invited }] = await Promise.all([
      admin.from("signup_allowlist").select("email").eq("email", email).maybeSingle(),
      admin
        .from("invites")
        .select("token")
        .eq("email", email)
        .is("accepted_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle(),
    ]);

    allowed = Boolean(allowlisted || invited);
  } catch {
    return {
      status: "error",
      message: "Sign-in is not configured yet. Check the Supabase environment variables.",
    };
  }

  if (!allowed) return genericSuccess;

  const origin = (await headers()).get("origin") ?? "";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const redirectTo = `${origin}${safeNext}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) {
    return { status: "error", message: "Could not send the link. Try again in a moment." };
  }

  return genericSuccess;
}
