#!/usr/bin/env node
/**
 * Seeds signup_allowlist from BOOTSTRAP_SIGNUP_EMAILS.
 *
 * This is the way in. Signup is closed: a database trigger refuses any email
 * that is neither on the allowlist nor holding a live invite, and invites can
 * only be issued by an existing household owner. Without seeding, the first
 * account can never be created — the login form fails closed and returns its
 * usual "if that address is invited…" message without sending anything, so
 * there is nothing to diagnose. Run this once against a fresh project.
 *
 * Safe to re-run: existing addresses are left alone.
 *
 *   pnpm setup:allowlist
 *
 * which is `node --env-file=.env.local scripts/seed-allowlist.mjs` — Node reads
 * the env file natively, so there is no dotenv dependency.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const raw = process.env.BOOTSTRAP_SIGNUP_EMAILS ?? "";

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!url || !serviceRoleKey) {
  fail(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "  Copy .env.example to .env.local and fill them in from your Supabase\n" +
      "  project under Settings → API.",
  );
}

const emails = Array.from(
  new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
);

if (emails.length === 0) {
  fail(
    "BOOTSTRAP_SIGNUP_EMAILS is empty.\n" +
      "  Set it in .env.local to the address you want to sign in with, e.g.\n" +
      "  BOOTSTRAP_SIGNUP_EMAILS=you@example.com",
  );
}

const invalid = emails.filter((email) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
if (invalid.length > 0) {
  fail(`These do not look like email addresses: ${invalid.join(", ")}`);
}

// The service role bypasses RLS, which is required here: signup_allowlist has
// RLS enabled and deliberately no policies, so it is unreadable and unwritable
// under the anon and authenticated keys.
const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: existing, error: readError } = await supabase
  .from("signup_allowlist")
  .select("email")
  .in("email", emails);

if (readError) {
  fail(
    `Could not read signup_allowlist: ${readError.message}\n` +
      "  Have the migrations been applied? Try `supabase db push`.",
  );
}

const already = new Set((existing ?? []).map((row) => row.email));
const toAdd = emails.filter((email) => !already.has(email));

if (toAdd.length > 0) {
  const { error: writeError } = await supabase
    .from("signup_allowlist")
    .insert(toAdd.map((email) => ({ email })));

  if (writeError) {
    fail(`Could not write to signup_allowlist: ${writeError.message}`);
  }
}

console.log("");
for (const email of emails) {
  console.log(`  ${already.has(email) ? "already there" : "added       "}  ${email}`);
}
console.log(
  toAdd.length > 0
    ? `\n  ${toAdd.length} added. Sign in at http://localhost:3000/login\n`
    : "\n  Nothing to do — all of them were already allowed.\n",
);
