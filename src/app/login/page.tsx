"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { requestMagicLink, type LoginState } from "./actions";

const initialState: LoginState = { status: "idle" };

function linkErrorMessage(error: string | null): string | null {
  if (error === "link_invalid") {
    return "That link was not valid. Request a new one below.";
  }
  if (error === "link_expired") {
    return "That link has expired or was already used. Request a new one below.";
  }
  return null;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "";
  const linkError = linkErrorMessage(searchParams.get("error"));
  const [state, formAction, pending] = useActionState(requestMagicLink, initialState);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6 py-12">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">whatsfordinner</h1>
        <p className="text-muted">
          No passwords. Put in your email and we will send you a link.
        </p>
      </header>

      {state.status === "sent" ? (
        <div
          role="status"
          className="rounded-2xl border border-line bg-raised p-5 text-sm leading-relaxed"
        >
          {state.message}
        </div>
      ) : (
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />

          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent"
            />
          </div>

          {state.status === "error" ? (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          ) : (
            linkError && (
              <p role="alert" className="text-sm text-danger">
                {linkError}
              </p>
            )
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send me a link"}
          </button>
        </form>
      )}

      <p className="text-xs text-muted">
        Sign-up is invite only.
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
