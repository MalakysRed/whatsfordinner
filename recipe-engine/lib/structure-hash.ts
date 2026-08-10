import { createHash } from "node:crypto";

import type { Archetype, ArchetypeStep, Slot } from "../schemas";

/**
 * `structure_hash` — SPEC.md §3.
 *
 * A verification records that *a specific version* of an archetype was cooked
 * and came out right. Edit the steps afterwards and that record is worthless,
 * so the hash covers the cooking-relevant fields and nothing else.
 *
 * Included: the ordered step sequence (`technique_id`, `pattern_id`,
 * `operates_on`, `vessel_id`, `merges_from`, `is_optional`, `condition` and the
 * three overrides), every slot's `role`, `cardinality`, `is_required` and
 * `quantity_rule_id`, and the archetype's `default_servings` and
 * `scaling_limits`.
 *
 * Deliberately excluded: all prose — `description`, `teaching_summary`,
 * `authoring_notes`, `region_note`, `ui_prompt`, `display_name`, `impact_note`,
 * `sensory_target`. Correcting a typo must not un-verify a dish cooked last
 * week; if prose edits triggered reversion the rule would be switched off
 * within a fortnight for being tiresome, which is worse than not having it.
 *
 * Uses `node:crypto`, which is stdlib rather than a new dependency. The engine
 * is a build-time data layer and nothing in the app imports it.
 */
export function computeStructureHash(
  archetype: Archetype,
  steps: ArchetypeStep[],
  slots: Slot[],
): string {
  const orderedSteps = steps
    .filter((step) => step.archetype_id === archetype.id)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((step) => ({
      technique_id: step.technique_id ?? null,
      pattern_id: step.pattern_id ?? null,
      operates_on: step.operates_on,
      vessel_id: step.vessel_id,
      // Sorted: `merges_from` is a set of vessels, so reordering it is not a
      // cooking change and should not expire a verification.
      merges_from: [...step.merges_from].sort(compareStrings),
      is_optional: step.is_optional,
      condition: step.condition ?? null,
      heat_override: step.heat_override ?? null,
      duration_override: step.duration_override ?? null,
      attention_override: step.attention_override ?? null,
    }));

  // Sorted by permanent ID rather than slug: a slug rename is a naming change,
  // and naming is on the excluded side of the line.
  const orderedSlots = slots
    .filter((slot) => slot.archetype_id === archetype.id)
    .slice()
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((slot) => ({
      role: slot.role,
      cardinality: slot.cardinality,
      is_required: slot.is_required,
      quantity_rule_id: slot.quantity_rule_id,
    }));

  return createHash("sha256")
    .update(
      canonicalJson({
        steps: orderedSteps,
        slots: orderedSlots,
        default_servings: archetype.default_servings,
        scaling_limits: archetype.scaling_limits ?? null,
      }),
    )
    .digest("hex");
}

/**
 * JSON with object keys sorted recursively, so the hash depends on the values
 * rather than on the order a field happened to be written in.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => compareStrings(a, b));

  return `{${entries
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`)
    .join(",")}}`;
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
