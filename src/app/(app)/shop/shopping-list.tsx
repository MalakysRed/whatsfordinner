"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { Button, Card, EmptyState, Input, Pill } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { roundForDisplay } from "@/lib/recipe/scale";
import { buildCoworkExport, downloadCoworkExport, type CoworkSettings } from "@/lib/shopping/cowork";
import { addManualItem, archiveActiveList, removeListItem, toggleItemTicked } from "./actions";
import type { ShopListItem } from "./page";

/**
 * Realtime is what makes FR9.7 real: one person in the shop ticking things
 * off, one person at home adding to the list. `initialItems` seeds the first
 * paint from the server; a `postgres_changes` subscription on this list's
 * rows keeps both tabs converged after that without a manual refresh.
 */
export function ShoppingList({
  listId,
  initialItems,
  settings,
  recipeTitles,
}: {
  listId: string;
  initialItems: ShopListItem[];
  settings: CoworkSettings;
  recipeTitles: Record<string, string>;
}) {
  const [items, setItems] = useState(initialItems);
  const [manualItem, setManualItem] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualUnit, setManualUnit] = useState("");
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`list_items:${listId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "list_items", filter: `list_id=eq.${listId}` },
        (payload: RealtimePostgresChangesPayload<ShopListItem>) => {
          setItems((current) => {
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as { id?: string }).id;
              return current.filter((item) => item.id !== oldId);
            }

            const row = payload.new as ShopListItem;

            if (payload.eventType === "INSERT") {
              return current.some((item) => item.id === row.id) ? current : [...current, row];
            }

            // UPDATE
            return current.map((item) => (item.id === row.id ? row : item));
          });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [listId]);

  async function onToggle(item: ShopListItem) {
    // Optimistic — realtime will confirm, but waiting for the round trip
    // before the tick shows makes a phone in a shop feel broken.
    setItems((current) =>
      current.map((i) => (i.id === item.id ? { ...i, ticked: !i.ticked } : i)),
    );
    await toggleItemTicked(item.id, !item.ticked);
  }

  async function onRemove(itemId: string) {
    setItems((current) => current.filter((i) => i.id !== itemId));
    await removeListItem(itemId);
  }

  async function onAddManual() {
    if (!manualItem.trim()) return;
    const amount = manualAmount.trim() ? Number(manualAmount) : null;
    await addManualItem(manualItem.trim(), amount && !Number.isNaN(amount) ? amount : null, manualUnit.trim() || null);
    setManualItem("");
    setManualAmount("");
    setManualUnit("");
  }

  async function onArchive() {
    setArchiving(true);
    try {
      await archiveActiveList(listId);
    } finally {
      setArchiving(false);
    }
  }

  function onExport() {
    const text = buildCoworkExport(
      items.map((i) => ({ item: i.item, amount: i.amount, unit: i.unit })),
      settings,
      Array.from(new Set(items.flatMap((i) => i.source_recipe_ids.map((id) => recipeTitles[id]).filter(Boolean)))),
    );
    downloadCoworkExport(text);
  }

  async function onCopy() {
    const text = buildCoworkExport(
      items.map((i) => ({ item: i.item, amount: i.amount, unit: i.unit })),
      settings,
      Array.from(new Set(items.flatMap((i) => i.source_recipe_ids.map((id) => recipeTitles[id]).filter(Boolean)))),
    );
    await navigator.clipboard.writeText(text);
  }

  return (
    <div className="space-y-4 pb-8">
      <Card className="flex items-center justify-end gap-3 p-4">
        <Button type="button" variant="secondary" onClick={() => void onArchive()} disabled={archiving}>
          {archiving ? "Archiving…" : "Done shopping"}
        </Button>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="Nothing on the list yet">
          Add a recipe from the book, or add something manually below.
        </EmptyState>
      ) : (
        <Card className="divide-y divide-line">
          {items.map((item) => {
            const sources = item.source_recipe_ids.map((id) => recipeTitles[id]).filter(Boolean);
            return (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={item.ticked}
                  onChange={() => void onToggle(item)}
                  aria-label={`Tick ${item.item}`}
                  className="mt-0.5 size-5 shrink-0 accent-[var(--accent)]"
                />
                <div className="min-w-0 flex-1">
                  <p className={`text-base ${item.ticked ? "text-muted line-through" : ""}`}>
                    {item.item}
                    {item.amount !== null && (
                      <span className="text-muted"> · {roundForDisplay(item.amount, item.unit)}</span>
                    )}
                  </p>
                  {sources.length > 0 && (
                    <p className="text-xs text-muted">From {sources.join(", ")}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void onRemove(item.id)}
                  aria-label={`Remove ${item.item}`}
                  className="shrink-0 text-sm text-muted underline"
                >
                  Remove
                </button>
              </div>
            );
          })}
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <h2 className="text-sm font-semibold">Add something</h2>
        <Input
          value={manualItem}
          onChange={(e) => setManualItem(e.target.value)}
          placeholder="Item"
        />
        <div className="flex gap-2">
          <Input
            value={manualAmount}
            onChange={(e) => setManualAmount(e.target.value)}
            placeholder="Amount"
            inputMode="decimal"
            className="flex-1"
          />
          <Input
            value={manualUnit}
            onChange={(e) => setManualUnit(e.target.value)}
            placeholder="Unit"
            className="flex-1"
          />
        </div>
        <Button type="button" onClick={() => void onAddManual()} className="w-full">
          Add
        </Button>
      </Card>

      {items.length > 0 && (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-semibold">Order via Claude Cowork</h2>
          <p className="text-sm text-muted">
            A ready-made prompt for Cowork to place the order — it will not
            complete checkout for you.
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => void onCopy()} className="flex-1">
              Copy
            </Button>
            <Button type="button" variant="secondary" onClick={onExport} className="flex-1">
              Download
            </Button>
          </div>
        </Card>
      )}

      {items.length > 0 && items.some((i) => i.ticked) && (
        <Pill tone="success">
          {items.filter((i) => i.ticked).length} of {items.length} ticked off
        </Pill>
      )}
    </div>
  );
}
