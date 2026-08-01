"use client";

import { useActionState, useState } from "react";
import { INGREDIENT_CATEGORIES } from "@/lib/db/types";
import {
  addIngredient,
  adoptStarters,
  bulkAddIngredients,
  type BankResult,
} from "./actions";

const initial: BankResult = { status: "idle" };

/** Add one, paste many, or top up from the starter catalogue (FR3.4). */
export function AddForms({ bankIsEmpty }: { bankIsEmpty: boolean }) {
  const [mode, setMode] = useState<"one" | "many" | null>(bankIsEmpty ? "one" : null);

  const [addState, addAction, addPending] = useActionState(addIngredient, initial);
  const [bulkState, bulkAction, bulkPending] = useActionState(bulkAddIngredients, initial);
  const [starterState, starterAction, starterPending] = useActionState(
    adoptStarters,
    initial,
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode(mode === "one" ? null : "one")}
          className="min-h-11 flex-1 rounded-xl border border-line bg-raised px-3 py-2 text-sm font-medium"
        >
          Add one
        </button>
        <button
          type="button"
          onClick={() => setMode(mode === "many" ? null : "many")}
          className="min-h-11 flex-1 rounded-xl border border-line bg-raised px-3 py-2 text-sm font-medium"
        >
          Paste a list
        </button>
        <form action={starterAction} className="flex-1">
          <button
            type="submit"
            disabled={starterPending}
            className="min-h-11 w-full rounded-xl border border-line bg-raised px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {starterPending ? "Adding…" : "Starter set"}
          </button>
        </form>
      </div>

      {starterState.message && (
        <p
          role="status"
          className={`text-sm ${starterState.status === "error" ? "text-danger" : "text-success"}`}
        >
          {starterState.message}
        </p>
      )}

      {mode === "one" && (
        <form
          action={addAction}
          className="space-y-3 rounded-2xl border border-line bg-raised p-4"
        >
          <input
            name="name"
            placeholder="Gochujang"
            required
            autoFocus
            className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
          />
          <select
            name="category"
            defaultValue="vegetable"
            aria-label="Category"
            className="w-full appearance-none rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
          >
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>

          {addState.status === "error" && (
            <p role="alert" className="text-sm text-danger">
              {addState.message}
            </p>
          )}

          <button
            type="submit"
            disabled={addPending}
            className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-base font-medium text-on-accent disabled:opacity-60"
          >
            {addPending ? "Adding…" : "Add"}
          </button>
        </form>
      )}

      {mode === "many" && (
        <form
          action={bulkAction}
          className="space-y-3 rounded-2xl border border-line bg-raised p-4"
        >
          <textarea
            name="names"
            rows={5}
            required
            autoFocus
            placeholder={"One per line, or comma separated:\nmiso paste\nmirin\nsesame seeds"}
            className="w-full rounded-xl border border-line bg-background px-4 py-3 text-base leading-relaxed outline-none focus:border-accent"
          />
          <select
            name="category"
            defaultValue="pantry"
            aria-label="Category for all of these"
            className="w-full appearance-none rounded-xl border border-line bg-background px-4 py-3 text-base outline-none focus:border-accent"
          >
            {INGREDIENT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="text-sm text-muted">
            They all go in one category. Change any of them afterwards by tapping
            the row.
          </p>

          {bulkState.message && (
            <p
              role={bulkState.status === "error" ? "alert" : "status"}
              className={`text-sm ${bulkState.status === "error" ? "text-danger" : "text-success"}`}
            >
              {bulkState.message}
            </p>
          )}

          <button
            type="submit"
            disabled={bulkPending}
            className="min-h-11 w-full rounded-xl bg-accent px-4 py-2.5 text-base font-medium text-on-accent disabled:opacity-60"
          >
            {bulkPending ? "Adding…" : "Add all"}
          </button>
        </form>
      )}
    </div>
  );
}
