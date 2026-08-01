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

## Decisions that deviate from the PRD

- **D1 — no aisle mapping.** FR9.8 is dropped; maintaining the lookup table was more
  admin than it was worth. The shopping list and the Cowork export group by
  ingredient `category`, which already exists on every ingredient.
- **D2 — signup allowlist is a table, not an env var.** `BOOTSTRAP_SIGNUP_EMAILS`
  seeds it once; after that adding a member needs no redeploy.
- **D3 — the ~150-ingredient starter set** is drafted in
  `supabase/migrations/0003_seed_ingredients.sql`, intended to be edited by hand.
- **D4 — no hosted Supabase or Vercel project yet.** Migrations are written to be
  applied to a hosted project later; local verification runs against a plain
  Postgres cluster.

## Commands

```
pnpm dev            # dev server
pnpm test           # vitest, pure logic
pnpm build          # production build
pnpm typecheck      # tsc --noEmit
pnpm db:verify      # apply migrations to a throwaway local Postgres cluster
```

## Conventions

- Mobile first. Design against a 390px viewport; desktop is a courtesy.
- Zod schemas in `src/lib/schemas/` are the single definition, shared between the
  Anthropic structured-output config, route handler validation and client forms.
- Anything importing `@anthropic-ai/sdk` or the service role key also imports
  `server-only`.
- Prompt templates take `meal_type` as a parameter rather than hardcoding "dinner",
  so adding breakfast later is a prompt and UI change, not a migration.
