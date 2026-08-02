import { CATEGORY_LABELS } from "@/lib/db/types";
import type { IngredientCategory } from "@/lib/db/types";
import { roundForDisplay } from "@/lib/recipe/scale";

/**
 * The Claude Cowork export (PRD section 10) — a copyable/downloadable prompt
 * block a household member pastes into Cowork to place the actual order.
 * Explicitly tells Cowork not to complete checkout: whoever runs the prompt
 * should be the one pressing buy, not the model.
 */

export interface CoworkItem {
  item: string;
  amount: number | null;
  unit: string | null;
  category: IngredientCategory | null;
}

export interface CoworkSettings {
  supermarket: string | null;
  delivery_day: string | null;
  shopping_notes: string | null;
}

export function buildCoworkExport(
  items: CoworkItem[],
  settings: CoworkSettings,
  recipeTitles: string[],
): string {
  const lines: string[] = [
    `I want to place a grocery order at ${settings.supermarket ?? "[SUPERMARKET]"} for delivery on ${
      settings.delivery_day ?? "[DAY]"
    }.`,
    "",
    "Please find each item below, choose a sensible pack size (round up rather",
    "than down), add it to my basket, and tell me anything you could not find",
    "or had to substitute before checking out. Do not complete the checkout.",
    "",
  ];

  if (settings.shopping_notes) {
    lines.push(`Preferences: ${settings.shopping_notes}`, "");
  }

  const byCategory = new Map<string, CoworkItem[]>();
  for (const item of items) {
    const key = item.category ? CATEGORY_LABELS[item.category] : "Other";
    byCategory.set(key, [...(byCategory.get(key) ?? []), item]);
  }

  for (const category of Array.from(byCategory.keys()).sort((a, b) => a.localeCompare(b))) {
    lines.push(category.toUpperCase());
    for (const item of byCategory.get(category)!) {
      const quantity = item.amount === null ? "" : `, ${roundForDisplay(item.amount, item.unit)}`;
      lines.push(`- ${item.item}${quantity}`);
    }
    lines.push("");
  }

  if (recipeTitles.length > 0) {
    lines.push(`These are for: ${recipeTitles.join(", ")}`);
  }

  return lines.join("\n").trim();
}

/** Downloads the export via a client-side blob — no server round trip. */
export function downloadCoworkExport(text: string): void {
  const blob = new Blob([text], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "shopping-list-cowork.md";
  link.click();

  URL.revokeObjectURL(url);
}
