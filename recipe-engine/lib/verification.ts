import type {
  Archetype,
  ArchetypeStep,
  Slot,
  VerificationStatus,
} from "../schemas";
import { computeStructureHash } from "./structure-hash";

/**
 * Verification status — SPEC.md §3.
 *
 * The status is **derived, never authored or stored**. What the author records
 * is the *fact* of having cooked the dish: `verified_at`,
 * `verified_structure_hash` and `verification_note`. The status falls out of
 * comparing that captured hash against the structure as it stands now.
 *
 * | Condition                                    | Derived status    |
 * |----------------------------------------------|-------------------|
 * | `verified_structure_hash` is absent          | `unverified`      |
 * | equals the computed `structure_hash`         | `author_verified` |
 * | differs from the computed `structure_hash`   | `unverified`      |
 *
 * Reversion is therefore not enforced — it simply *is*. The derived value
 * changes the instant the structure does, and there is nothing to override
 * because there is no stored field to overwrite. That keeps the validator to
 * rejection-not-correction: it never mutates authored data, and reversion is
 * not one of its concerns at all.
 */
export function deriveVerificationStatus(
  archetype: Archetype,
  steps: ArchetypeStep[],
  slots: Slot[],
): VerificationStatus {
  return evaluate(archetype, steps, slots).status;
}

/**
 * The single place the comparison is made. Both the derived status and the
 * build report route through here so they cannot drift apart, and it returns
 * the computed hash alongside the verdict so the report can name it without
 * hashing a second time.
 */
function evaluate(
  archetype: Archetype,
  steps: ArchetypeStep[],
  slots: Slot[],
): { status: VerificationStatus; current_structure_hash: string } {
  const current_structure_hash = computeStructureHash(archetype, steps, slots);

  const status: VerificationStatus =
    archetype.verified_structure_hash === current_structure_hash
      ? "author_verified"
      : "unverified";

  return { status, current_structure_hash };
}

export interface RevertedArchetype {
  id: string;
  display_name: string;
  /** The structure that was actually cooked. */
  verified_structure_hash: string;
  /** What the structure hashes to now. */
  current_structure_hash: string;
  verified_at?: string;
}

export interface VerificationReport {
  /** Archetypes carrying a verification that still applies. */
  verified: number;
  /** Archetypes that have never been cooked — no verification record at all. */
  never_verified: number;
  /** Cooked once, then restructured. The verification no longer applies. */
  reverted: RevertedArchetype[];
}

/**
 * Build-time reporting, deliberately not validation.
 *
 * Editing an archetype is legitimate work, and failing the build for an
 * expected consequence of legitimate work is the kind of rule that gets
 * switched off. So a reverted archetype is counted and named, not raised as an
 * error — `validate()` returns no verification issues whatsoever.
 */
export function reportVerification(
  archetypes: Archetype[],
  steps: ArchetypeStep[],
  slots: Slot[],
): VerificationReport {
  const report: VerificationReport = {
    verified: 0,
    never_verified: 0,
    reverted: [],
  };

  for (const archetype of archetypes) {
    // Never cooked at all — distinct from cooked-then-restructured, though the
    // derived status is `unverified` for both.
    if (archetype.verified_structure_hash === undefined) {
      report.never_verified += 1;
      continue;
    }

    const { status, current_structure_hash } = evaluate(archetype, steps, slots);
    if (status === "author_verified") {
      report.verified += 1;
      continue;
    }

    report.reverted.push({
      id: archetype.id,
      display_name: archetype.display_name,
      verified_structure_hash: archetype.verified_structure_hash,
      current_structure_hash,
      verified_at: archetype.verified_at,
    });
  }

  return report;
}

/**
 * The build-log rendering, in the shape SPEC.md §3 specifies.
 *
 * It **names** the reverted archetypes rather than only counting them, and it
 * does not claim a delta: nothing persists between builds, so "reverted since
 * last build" is not computable without a committed manifest — and a state file
 * that changes on every build buys git noise and merge conflicts for very
 * little. Naming supplies what a delta would have. If you have just edited the
 * curry and the curry is listed, the cause is obvious; a bare count teaches you
 * to ignore it.
 */
export function formatVerificationReport(report: VerificationReport): string {
  const { verified, never_verified, reverted } = report;
  const lines: string[] = [];

  if (reverted.length > 0) {
    lines.push(
      `${reverted.length} ${plural(reverted.length, "archetype")} reverted to unverified:`,
    );
    for (const archetype of reverted) {
      const cooked =
        archetype.verified_at === undefined
          ? "structure changed since"
          : `verified ${archetype.verified_at.slice(0, 10)}, structure changed since`;
      lines.push(`  ${archetype.id}  (${cooked})`);
    }
  }

  lines.push(`${never_verified} ${plural(never_verified, "archetype")} never verified`);
  lines.push(
    `${verified} ${plural(verified, "archetype")} verified against current structure`,
  );

  return lines.join("\n");
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
