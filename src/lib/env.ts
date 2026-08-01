import { z } from "zod";

// NEXT_PUBLIC_ values are inlined at build time, so they have to be referenced
// as full literal property accesses rather than looked up dynamically.
const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

const publicSchema = z.object({
  supabaseUrl: z.url(),
  supabaseAnonKey: z.string().min(1),
});

export function getPublicEnv() {
  const parsed = publicSchema.safeParse(publicEnv);

  if (!parsed.success) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY — see .env.example.",
    );
  }

  return parsed.data;
}

/**
 * Server-only secrets, read one at a time and lazily.
 *
 * Deliberately two functions rather than one validated object. Validating them
 * together meant the admin client — which the login action uses to check the
 * allowlist — pulled in the Anthropic key, so a project with Supabase configured
 * but no Anthropic key could not sign in at all, and reported the failure as a
 * Supabase misconfiguration. Generation is the only thing that should break
 * without an Anthropic key; the bank, the book and signing in are unaffected.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in .env.local — see .env.example.`,
    );
  }
  return value;
}

export function getAnthropicKey(): string {
  return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
}

export function getSupabaseServiceRoleKey(): string {
  return required(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * Emails allowed to create the first account (decision D2).
 *
 * Consumed by `scripts/seed-allowlist.mjs`, not by the app: the allowlist lives
 * in the database, and this env var only seeds it once so that somebody can get
 * in and start issuing invites.
 */
export function getBootstrapSignupEmails(): string[] {
  return (process.env.BOOTSTRAP_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
