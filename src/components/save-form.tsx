"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionResult } from "@/app/(app)/settings/actions";

const initialState: ActionResult = { status: "idle" };

/**
 * A settings section that saves on its own.
 *
 * Settings is one long scrolling page of independent concerns; one giant form
 * with a single save button would mean an unrelated validation error blocks a
 * change you did make.
 */
export function SaveForm({
  action,
  children,
  submitLabel = "Save",
}: {
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-4">
      {children}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded-xl bg-accent px-4 py-2.5 text-base font-medium text-on-accent disabled:opacity-60"
        >
          {pending ? "Saving…" : submitLabel}
        </button>

        {state.status === "saved" && !pending && (
          <span role="status" className="text-sm text-success">
            Saved
          </span>
        )}
        {state.status === "error" && (
          <span role="alert" className="text-sm text-danger">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
