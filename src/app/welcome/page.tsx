import { redirect } from "next/navigation";
import { getHouseholdSession, getUser } from "@/lib/auth/session";
import { WelcomeForm } from "./welcome-form";

export default async function WelcomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Already set up — nothing to do here.
  const session = await getHouseholdSession();
  if (session) redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Set up your kitchen</h1>
        <p className="text-muted">
          One household, shared between everyone in it. You can invite the other
          half once this is done.
        </p>
      </header>

      <WelcomeForm />
    </main>
  );
}
