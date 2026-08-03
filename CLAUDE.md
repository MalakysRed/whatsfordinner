@AGENTS.md

# whatsfordinner

Two people, one kitchen, one recurring stalemate. The app turns "what's for dinner?"
into three concrete suggestions, then a full scalable recipe card. See `docs/prd.md`.

**The thing to protect:** time from opening the app to "right, that one" under 90
seconds. Every screen added to the front of that funnel works against the product's
reason to exist. `Surprise us` stays one tap.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Supabase (Postgres,
Auth, Realtime, RLS) · Zod 4 · React Query · `@anthropic-ai/sdk` · Vitest.

Next.js 16 notes: `middleware` is now `proxy` (`src/proxy.ts`), `cookies()` is
async, and dynamic route `params` is a `Promise`. Read `node_modules/next/dist/docs/`
before assuming an API matches older versions.

## Non-obvious invariants

**The `{ing_N}` placeholder contract.** Recipe steps reference ingredients by id in
curly braces (`"Toss {ing_1} with {ing_4}"`), never as literal quantities. The client
substitutes the scaled, unit-converted amount at render time. This is what makes the
servings stepper work without a second API call and what makes the shopping list
trustworthy. `recipeSchema` fails parsing if a step references an id that is not in
the ingredient list — a dangling placeholder must never reach a kitchen.

**Allergens are enforced in code, not just in the prompt.** Every generated recipe is
checked against the household's allergen-flagged ingredients after parsing. On a hit
the card is discarded and regenerated, then hard-errors. A language model is not the
only line of defence on an allergy.

**Recency weighting is a slot quota, not a prompt adverb.** Claude will not reliably
distinguish "a bit" from "sometimes". How many of the three suggestion slots may hold
a recently-cooked meal is computed in application code before the generation call.

**Saved recipes are immutable artefacts.** `recipes.payload` holds the full recipe
JSON. Recipes are never normalised into ingredient rows, so editing or deleting an
ingredient in the bank can never silently rewrite a recipe you cooked last month.

**Free-text feedback is data, never instruction.** User feedback ("something
lighter") is passed inside a delimited block and must not override dietary or
allergen rules.

**Auth is checked in three places.** RLS at the database, an auth check in every
route handler and server action, and session refresh in the proxy. Next.js docs warn
that a matcher change can silently remove proxy coverage, so the proxy is never the
only gate.

## Model configuration gotchas

All in `src/lib/ai/models.ts`, and all easy to get wrong from memory:

- Structured outputs are `output_config.format`, not the deprecated top-level
  `output_format`. `effort` rides in the *same* `output_config` object — setting the
  two in separate spread objects silently drops one.
- **Sonnet 5 runs adaptive thinking by default** and defaults to `high` effort. Left
  alone it overshoots the PRD's latency targets and costs more than this app needs,
  so `EFFORT_FOR_CALL` sets it explicitly. That constant is the main latency and cost
  lever — raise it if the food is dull, lower it if calls drag.
- `max_tokens` on Sonnet 5 caps thinking *and* response text together, so it needs
  headroom well past the visible output or a card truncates mid-step.
- **Haiku 4.5 rejects `effort` outright** — it is only sent to models where
  `supportsEffort` is true.
- Prompt-cache minimums differ per model and are not monotonic: 1024 tokens on
  Sonnet 5, 4096 on Haiku 4.5. Below the minimum the breakpoint does nothing, with no
  error — so the flavour call may simply not cache, which is fine.
- Zod constraints JSON Schema cannot express (`.max(140)` on the pitch) are stripped
  from what is sent to Claude and enforced locally by the SDK. That is the split the
  PRD asks for, and it happens for free.
- Cost must account for cache reads (a tenth of input) and cache writes (a quarter
  more). `estimateCostUsd` does; a figure using only `input_tokens` would be wrong in
  both directions.

## Decisions that deviate from the PRD

- **D1 — no aisle mapping.** FR9.8 is dropped; maintaining the lookup table was more
  admin than it was worth. The shopping list and the Cowork export group by
  ingredient `category`, which already exists on every ingredient.
- **D2 — signup allowlist is a table, not an env var.** After the first account,
  adding a member needs no redeploy. Nothing seeds the table automatically: a
  migration cannot read an env var, so `pnpm setup:allowlist` copies
  `BOOTSTRAP_SIGNUP_EMAILS` in. **Skip it on a fresh project and nobody can sign
  up at all** — signup is refused for any address that is neither allowlisted nor
  invited, and invites can only be issued by an existing owner. The login form
  fails closed and looks identical to a working one, so there is nothing to see.
- **D3 — the ~150-ingredient starter set** is a global catalogue in
  `supabase/migrations/20260801120400_starter_ingredients.sql`, intended to be
  edited by hand. Households copy from it rather than owning a duplicate each.
- **D4 — no hosted Supabase or Vercel project yet.** Migrations are written to be
  applied to a hosted project later; local verification runs against a plain
  Postgres cluster.

## Commands

```
pnpm dev              # dev server
pnpm test             # vitest, pure logic
pnpm build            # production build
pnpm typecheck        # tsc --noEmit
pnpm db:verify        # apply migrations to a throwaway local Postgres cluster
pnpm setup:allowlist  # seed signup_allowlist from BOOTSTRAP_SIGNUP_EMAILS
```

First run against a hosted project: `supabase link --project-ref <ref>`,
`supabase db push`, `pnpm setup:allowlist`. Then in the dashboard set Auth → URL
Configuration (Site URL plus `/auth/confirm` and `/auth/confirm?next=*` as
redirect URLs) and override **both** the magic-link and the invite email
templates to
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
and
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next={{ .RedirectTo }}`
respectively — the stock templates use a flow `/auth/confirm` does not
implement, and every link will bounce to `/login?error=link_invalid` until
both are changed. Inviting someone from Settings uses the invite template;
signing in uses the magic-link one.

**The `&next={{ .RedirectTo }}` part is not optional.** Every call site passes
`emailRedirectTo`/`redirectTo` as the actual page to land on afterwards (e.g.
`/invite/<token>` for an invite, whatever page bounced the visitor to `/login`
for a magic link) — never a pre-built `/auth/confirm?...` URL, because the
template is what builds that URL, and it only knows the destination if the
template forwards `{{ .RedirectTo }}` itself. Leave that out of either
template and `next` silently disappears: `/auth/confirm` defaults to `/`, an
invited user lands on the home page instead of `/invite/<token>`, never calls
`accept_invite`, and ends up creating their own separate household on
`/welcome` instead of joining yours — two households, nothing shared, no
error anywhere to point at why.

If Auth → SMTP Settings points at Resend (or any provider) in sandbox/test
mode, every email to anyone other than the account's own verified address
silently 500s server-side — Resend's own dashboard logs it, Supabase's Auth
Logs show it, but the client only ever sees an opaque failure. Verify a
domain at resend.com/domains and point the SMTP sender address at it before
assuming invites (or magic links to anyone but the owner) are broken code.

## Conventions

- Mobile first. Design against a 390px viewport; desktop is a courtesy.
- Zod schemas in `src/lib/schemas/` are the single definition, shared between the
  Anthropic structured-output config, route handler validation and client forms.
- Anything importing `@anthropic-ai/sdk` or the service role key also imports
  `server-only`.
- Prompt templates take `meal_type` as a parameter rather than hardcoding "dinner",
  so adding breakfast later is a prompt and UI change, not a migration.
