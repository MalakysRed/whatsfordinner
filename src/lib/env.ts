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

const serverSchema = z.object({
  anthropicApiKey: z.string().min(1),
  supabaseServiceRoleKey: z.string().min(1),
});

/**
 * Server-only secrets. Read lazily rather than at module load so that a missing
 * ANTHROPIC_API_KEY breaks generation with a clear message instead of breaking
 * the whole app at boot — the ingredient bank and recipe book still work without
 * it.
 */
export function getServerEnv() {
  const parsed = serverSchema.safeParse({
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Missing server environment configuration: ${missing}`);
  }

  return parsed.data;
}

/** Emails seeded into signup_allowlist on first run (decision D2). */
export function getBootstrapSignupEmails(): string[] {
  return (process.env.BOOTSTRAP_SIGNUP_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}
