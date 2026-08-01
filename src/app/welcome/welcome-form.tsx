"use client";

import { useActionState } from "react";
import { createHousehold, type WelcomeState } from "./actions";

const initialState: WelcomeState = { status: "idle" };

export function WelcomeForm() {
  const [state, formAction, pending] = useActionState(createHousehold, initialState);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="name" className="block text-sm font-medium">
          What shall we call it?
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoFocus
          defaultValue="Our kitchen"
          className="w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none focus:border-accent"
        />
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-line bg-raised p-4">
        <input
          type="checkbox"
          name="adopt_starters"
          defaultChecked
          className="mt-1 size-5 accent-[var(--accent)]"
        />
        <span className="text-sm leading-relaxed">
          <span className="font-medium">Start with a stocked bank</span>
          <span className="block text-muted">
            Around 170 common ingredients, flagged with sensible staples. Edit or
            delete anything — it is only a starting point, and it means you can
            generate something tonight rather than after an evening of typing.
          </span>
        </span>
      </label>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-on-accent disabled:opacity-60"
      >
        {pending ? "Setting up…" : "Create household"}
      </button>
    </form>
  );
}
