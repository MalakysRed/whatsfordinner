import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Accepting an invite (FR1.3).
 *
 * The proxy has already bounced signed-out visitors to /login?next=/invite/…, so
 * by the time this renders the user has an account — which the signup trigger
 * only allowed because creating the invite allowlisted their email.
 *
 * Acceptance goes through a SECURITY DEFINER function: the invitee cannot read
 * the invite row until they are a member, and cannot become a member until the
 * invite has been read.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const user = await getUser();
  if (!user) redirect(`/login?next=/invite/${token}`);

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { invite_token: token });

  if (!error) redirect("/");

  const reason = describe(error.message);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">
        That invite did not work
      </h1>
      <p className="text-muted leading-relaxed">{reason}</p>
      <Link
        href="/"
        className="rounded-xl bg-accent px-4 py-3 text-center text-base font-medium text-on-accent"
      >
        Go to the app
      </Link>
    </main>
  );
}

function describe(message: string): string {
  if (message.includes("invite_expired")) {
    return "Invites last seven days and this one has run out. Ask for a fresh link.";
  }
  if (message.includes("invite_already_used")) {
    return "This invite has already been accepted.";
  }
  if (message.includes("invite_email_mismatch")) {
    return "This invite was sent to a different email address than the one you signed in with.";
  }
  if (message.includes("already_in_household")) {
    return "You are already part of a household.";
  }
  if (message.includes("invite_not_found")) {
    return "We could not find that invite. Check the link is complete.";
  }
  return "Something went wrong accepting the invite. Ask for a fresh link.";
}
