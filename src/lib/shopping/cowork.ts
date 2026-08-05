import { roundForDisplay } from "@/lib/recipe/scale";

/**
 * The Claude Cowork export (PRD section 10) — a copyable/downloadable prompt
 * block a household member pastes into Cowork to place the actual order.
 * Explicitly tells Cowork not to complete checkout: whoever runs the prompt
 * should be the one pressing buy, not the model.
 *
 * A flat alphabetised list rather than grouped by category (decision D1 has
 * been superseded: the ingredient bank that supplied `category` is gone, and
 * this phase does not reintroduce a grouping source purely for the export).
 */

export interface CoworkItem {
  item: string;
  amount: number | null;
  unit: string | null;
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

  for (const item of [...items].sort((a, b) => a.item.localeCompare(b.item))) {
    const quantity = item.amount === null ? "" : `, ${roundForDisplay(item.amount, item.unit)}`;
    lines.push(`- ${item.item}${quantity}`);
  }

  if (recipeTitles.length > 0) {
    lines.push("", `These are for: ${recipeTitles.join(", ")}`);
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
