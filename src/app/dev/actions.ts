"use server";

import { headers } from "next/headers";
import { requireDevSession } from "@/lib/auth/dev";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadHouseholdContext } from "@/lib/ai/prompts/context";
import { GenerationError, assertUnderDailyCap } from "@/lib/ai/client";
import { V1_MEAL_TYPE } from "@/lib/api/handler";
import { generateOptionSummaries, OPTION_COUNT } from "@/lib/ai/generate";
import { drawSeedSet, type EffortBand } from "@/lib/generation/variance-engine";
import { fetchActiveSeedPool, recentSeedNames } from "@/lib/generation/seed-draw";
import type { SeedAxis } from "@/lib/db/types";
import type { Option } from "@/lib/schemas/option";

export interface InviteResult {
  status: "idle" | "sent" | "error";
  message?: string;
}

/**
 * Grants app access without creating an invites row or touching a household —
 * the friend lands on /welcome and builds their own kitchen, rather than
 * joining yours. Mirrors settings/actions.ts's createInvite for email
 * delivery (same Supabase invite-email / magic-link-fallback pattern), but
 * calls create_app_invite instead of create_invite: that RPC only allowlists
 * the email, and is itself gated on is_dev at the database layer.
 */
export async function inviteFriendToApp(
  _prev: InviteResult,
  formData: FormData,
): Promise<InviteResult> {
  await requireDevSession();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_app_invite", { invite_email: email });

  if (error) {
    if (error.message.includes("invalid_email")) {
      return { status: "error", message: "That does not look like an email address." };
    }
    return { status: "error", message: "Could not create the invite." };
  }

  const origin = (await headers()).get("origin") ?? "";
  const redirectTo = `${origin}/welcome`;

  const admin = createAdminClient();
  const { error: inviteEmailError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (inviteEmailError) {
    if (inviteEmailError.code !== "email_exists") {
      console.error(
        `inviteFriendToApp: inviteUserByEmail failed (code=${inviteEmailError.code}, status=${inviteEmailError.status}): ${inviteEmailError.message}`,
      );
      return {
        status: "error",
        message: "The invite was allowed but the email could not be sent. Try again.",
      };
    }

    // Already has an account — Supabase won't send an "invite" email to an
    // existing user, but a normal sign-in link lands them on /welcome just as well.
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (otpError) {
      console.error(
        `inviteFriendToApp: signInWithOtp fallback failed (code=${otpError.code}, status=${otpError.status}): ${otpError.message}`,
      );
      return {
        status: "error",
        message: "The invite was allowed but the email could not be sent. Try again.",
      };
    }
  }

  return {
    status: "sent",
    message: `Invited ${email}. They'll land on their own "Set up your kitchen" screen once they sign in — not yours.`,
  };
}

export interface SeedLabResult {
  status: "idle" | "done" | "error";
  message?: string;
  options?: Option[];
  seeds?: { axis: SeedAxis; name: string }[];
}

const AXES: SeedAxis[] = ["cuisine", "format", "hero"];
const EFFORT_BANDS: EffortBand[] = ["quick", "standard", "project"];

/**
 * A real generateOptionSummaries call, exactly like /api/options, except any
 * axis with a "lock to…" value skips the random draw for every slot that
 * cycles to it — so you can see how one specific seed actually behaves
 * across the eight directions, instead of waiting for the random draw to
 * happen to pick it.
 */
export async function generateLockedOptions(
  _prev: SeedLabResult,
  formData: FormData,
): Promise<SeedLabResult> {
  const session = await requireDevSession();

  const effortBandRaw = String(formData.get("effort_band") ?? "");
  if (!EFFORT_BANDS.includes(effortBandRaw as EffortBand)) {
    return { status: "error", message: "Pick an effort band." };
  }
  const effortBand = effortBandRaw as EffortBand;

  const supabase = await createClient();

  try {
    const context = await loadHouseholdContext(supabase, session.householdId, V1_MEAL_TYPE);
    const { remaining } = await assertUnderDailyCap(
      session.userId,
      context.settings.daily_generation_cap,
    );

    const [pool, excludedSeedNames] = await Promise.all([
      fetchActiveSeedPool(supabase),
      recentSeedNames(supabase, session.householdId),
    ]);

    const seeds = drawSeedSet(pool, context.season, effortBand, excludedSeedNames, OPTION_COUNT);

    for (let i = 0; i < seeds.length; i++) {
      const axis = AXES[i % AXES.length];
      const lockedName = String(formData.get(`lock_${axis}`) ?? "").trim();
      if (lockedName) seeds[i] = { axis, name: lockedName };
    }

    const caller = {
      householdId: session.householdId,
      userId: session.userId,
      mealType: V1_MEAL_TYPE,
      context,
      settings: context.settings,
      remaining,
    };

    const result = await generateOptionSummaries(caller, {
      effortBand,
      categoryPicks: [],
      needsUsingUp: null,
      batchCooking: false,
      seeds,
    });

    return { status: "done", options: result.options, seeds };
  } catch (error) {
    if (error instanceof GenerationError) {
      return { status: "error", message: error.message };
    }
    console.error("generateLockedOptions failed", error);
    return { status: "error", message: "Something went wrong. Try again." };
  }
}
