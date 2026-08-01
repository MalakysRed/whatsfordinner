# whatsfordinner: Product Requirements Document

**Version:** 0.1 (draft for review)
**Date:** 1 August 2026
**Owner:** Nathan Bray
**Production URL:** https://dins.bray.life
**Repo:** GitHub, deployed via Vercel

---

## 1. Problem

Two people, one kitchen, one recurring stalemate: "what's for dinner?" Neither party wants to decide, both have opinions once someone else decides, and the fridge does not volunteer suggestions. Recipe sites solve the wrong problem: they assume you already know what you want to cook. The actual bottleneck is choosing, not looking up.

whatsfordinner turns the question into a short set of constraints (what protein, what carb, what cuisine, what flavour direction) and returns three concrete dinners. Pick one, get a proper recipe card, scale it to the number of people eating, cook from it, shop from it.

**Core insight to protect during build:** the app succeeds when it reduces the time from "what's for dinner" to "right, that one" to under a minute. Every screen added to the front of that funnel works against the product's reason to exist.

---

## 2. Goals

| Goal | Measure |
| --- | --- |
| Kill the nightly stalemate | Median time from app open to recipe card chosen is under 90 seconds |
| Cook things you actually like | At least 40% of generated cards get saved to the recipe book |
| Stop cooking the same six meals | At least 60% of cooked meals in a month are not repeats of the previous fortnight |
| Make shopping fall out of cooking, not the other way round | A weekly shop can be assembled from favourites in under 5 minutes |

## 3. Non goals (v1)

- Meal planning across a calendar week (a plan grid, drag and drop, etc). The shopping list from favourites covers 80% of that value for 10% of the work.
- Nutrition tracking, calorie counting or diet programmes.
- Sharing recipes publicly, social features, or accounts for anyone outside the household.
- Actually placing a grocery order. The app hands off to Claude Cowork.
- Photos of finished dishes. Generated images add cost and lie about the outcome.
- Breakfast, lunch and snacks. Dinner only in v1. The schema carries `meal_type` from day one (section 11) so adding them later is a prompt and UI change, not a migration.
- Drink pairings. Decided against.

---

## 4. Users and roles

Two named users in one household, with more possible later.

| Role | Rights |
| --- | --- |
| Household member | Full access to the shared ingredient bank, recipe book, shopping lists and settings. Can generate, save, favourite, edit and delete. |
| Household owner | Everything above, plus invite and remove members, and delete the household. |

**Attribution requirements**

- Every recipe records `created_by` (who generated and saved it) and `created_at`.
- Favouriting is per user, not per household. A recipe can be favourited by one, both or neither.
- The recipe book displays both: "Added by Nathan, favourited by Nathan and [wife]". Two small avatars or initials on the card is enough.
- Shopping list items record who added them and from which recipe.
- Filters in the recipe book: "Added by me", "Favourited by me", "Favourited by both", "Favourited by [other member]".

The "favourited by both" filter is the important one. It is the closest thing the app has to a guaranteed win, and it is what the weekly shop should default to.

---

## 5. Confirmed decisions

All confirmed on 1 August 2026. Recorded here because the reasoning behind them is otherwise invisible in the requirements below, and because each is cheap to revisit now and expensive to revisit after the schema is written.

| # | Decision | Status |
| --- | --- | --- |
| A1 | Repeat behaviour is user configurable, not fixed. See FR2.7 to FR2.9. | Superseded by FR2.7 |
| A2 | Ingredients carry flags: `loved`, `disliked` (never suggest), `staple` (assume in the cupboard), and `allergen`. Allergens are a hard exclusion applied to every generation for every household member. | Confirmed |
| A3 | `staple` ingredients are excluded from shopping lists by default, with a toggle per list to include them. | Confirmed |
| A4 | Nutrition is not shown. The protein, fat, carb and veg structure is a composition tool only. | Confirmed |
| A5 | One shared running shopping list per household, with items merged and quantities combined across recipes, tickable, and a history of previous lists. | Confirmed |
| A6 | Total time is a filter on the builder ("under 30 minutes", "under 60", "no limit"), defaulting to no limit. | Confirmed |
| A7 | The Cowork export is a copyable text block and a downloadable `.md` file containing the list grouped by supermarket aisle, with your preferred supermarket, pack size guidance and brand notes pulled from settings. | Confirmed |
| A8 | The Claude API key lives in Vercel environment variables and is used only by server routes. The browser never sees it. Generation endpoints are gated by authentication and by a daily cap per user. | Not negotiable while the app sits on a public domain |

---

## 6. Key concepts

- **Ingredient bank:** the household's editable list of ingredients you actually like, categorised and flagged. The generator is biased towards this list but is allowed to reach outside it when a dish needs it (clearly marked in the card as "not in your bank").
- **Meal frame:** the composition of the plate. Protein (animal or plant), healthy fat, complex carb, vegetables and fruit. Any slot can be left as "you choose".
- **Flavour layer:** the sauce, dressing, dip, rub, marinade or pickle that gives the dish its character. Suggested by Claude based on the cuisine and the chosen components, then picked by the user.
- **Suggestion:** a short pitch for a dish (title, one line description, key ingredients, rough time, difficulty). Three are generated at a time. Cheap to produce.
- **Recipe card:** the full structured recipe generated from a chosen suggestion. Expensive to produce and the thing that gets saved.
- **Cook log:** a record that a recipe was actually cooked, on a date, by someone. Drives repeat avoidance.

---

## 7. Primary flows

### 7.1 Fast path (the one that matters)

1. Open app. Home screen shows a large **Surprise us** button, a **Build a meal** button, and a row of "favourited by both" recipes.
2. Tap **Surprise us**. No further input. The app generates three suggestions using the ingredient bank, settings, dietary rules and cook log alone.
3. Tap a suggestion. Recipe card generates.
4. Set servings. Cook.

Target: three taps, two generation calls, under 90 seconds.

### 7.2 Constrained path

1. **Build a meal.** A single scrolling screen, not a wizard. Every section is optional and collapsed by default with a summary of the current value ("Protein: you choose").
2. Sections in order: **needs using up**, meal frame, cuisine, flavour layer, time limit, servings.
3. **Needs using up** is a single optional free text field: "chicken breast, tenderstem". Whatever is typed here becomes a hard requirement of every suggestion. It sits first because it is the strongest constraint when it applies and irrelevant when it does not.
4. Cuisine is a chip list (Mexican, Indian, Japanese, Thai, Italian, Greek, Middle Eastern, Chinese, Korean, French, British, Spanish, Vietnamese, plus a free text field).
5. Once cuisine and at least one frame component are chosen, the flavour layer section calls Claude and offers six to eight named options with one line descriptions ("Nam jim: fish sauce, lime, chilli, palm sugar. Sharp and hot"). Multi select up to two. Regenerating this list is a single tap.
6. **Get suggestions** at the bottom, sticky.

### 7.3 Use it up path

Not a separate screen. **Use it up** on the home screen opens the builder with the "needs using up" field focused and every other section left open, because the fridge is already constraint enough. One screen, one endpoint, one code path.

1. **Use it up** on the home screen, third button.
2. Type what needs eating.
3. Optionally add a cuisine or time limit.
4. Suggestions are generated with those ingredients as a hard requirement, ranked so that dishes needing nothing beyond your staples come first.

### 7.4 Suggestions

- Three cards, each with title, one line pitch, the frame components used, estimated total time, and any ingredients not in your bank.
- **Refresh** regenerates all three. A free text box sits next to it: "not that, we had rice last night", "something lighter", "more of a traybake". The comment plus the three rejected titles are passed into the next call so it does not repeat itself.
- Rejection comments are stored against the session for later prompt tuning, and count as a signal in the taste profile.
- Every refresh is a new API call. The daily cap applies and is shown when it gets close.

### 7.5 Recipe card

Generated from the chosen suggestion. Contains:

- Title, one line description, cuisine, total time, active time, difficulty.
- Equipment required, checked against your settings. If the recipe needs something you do not own, the card flags it and offers a workaround.
- Ingredients as structured data: amount, unit, item, preparation note, and the frame component it belongs to.
- Numbered steps, each optionally carrying a duration and a temperature.
- Serving suggestion and a "make it better next time" note.

Controls on the card:

| Control | Behaviour |
| --- | --- |
| Servings stepper | Recalculates all quantities live. Default from settings. Range 1 to 12. |
| Units toggle | Metric or imperial per measurement family, from settings, overridable on the card. |
| Cooking mode | Full screen, large type, step by step, screen kept awake. |
| Timers | Any step with a duration gets a tap to start timer. Multiple concurrent timers, named after their step. |
| Add to shopping list | Adds all ingredients not flagged as staples, at the current serving count. |
| Save to book | Persists the card. Optional favourite at the same time. |
| Mark as cooked | Writes to the cook log. Prompts for a quick rating. |
| Refresh card | Regenerates with a free text comment ("too much faff", "we do not have a pestle and mortar", "make the sauce sharper"). Previous version kept and viewable until you leave the screen. |

---

## 8. Functional requirements

### 8.1 Accounts and household

- **FR1.1** Email based sign in. Magic link preferred over passwords for a two person app.
- **FR1.2** A user belongs to exactly one household in v1. The schema should not assume this permanently.
- **FR1.3** Household owner can generate an invite link valid for 7 days.
- **FR1.4** All household data (bank, book, lists, settings) is visible to all members. There is no private content.
- **FR1.5** Sign up is closed by default. Only invited emails, or an allowlist, can create an account. The app is on a public domain and every new account is a hole in your API budget.

### 8.2 Settings

- **FR2.1 Equipment:** a checklist covering hob, conventional oven, fan oven, grill, microwave, air fryer, slow cooker, pressure cooker, rice cooker, blender, stick blender, food processor, stand mixer, pestle and mortar, wok, cast iron pan, griddle pan, barbecue, sous vide, thermometer, mandoline, spiraliser, scales. Free text for anything else. Every generation is constrained to available equipment.
- **FR2.2 Measurements:** independent toggles for weight (g/kg or oz/lb), volume (ml/l or fl oz/cups/pints), temperature (C or F), and an option to also show gas mark. Length for tin sizes (cm or inches).
- **FR2.3 Household defaults:** default servings, default time limit, spice tolerance (mild to very hot), and a free text "things to know about how we eat".
- **FR2.4 Dietary rules:** per member. Allergens (hard exclusion), avoidances (soft, never suggested but not treated as dangerous), and diet type (none, vegetarian, pescatarian, vegan, etc). Rules from all members are unioned and applied to every generation.
- **FR2.5 Shopping:** preferred supermarket, delivery day, brand or size preferences as free text. Used only for the Cowork export.
- **FR2.6 Generation:** a daily generation cap per user, visible and editable by the owner, defaulting to 30.
- **FR2.7 Suggestion variety:** household level settings controlling whether meals you have already met can be suggested again.
  - **Only new** (master toggle, default off). When on, suggestions exclude everything already in the recipe book: cooked, favourited, or merely saved. The three settings below are hidden while it is on.
  - When off, three settings appear:
    - **Recency weighting:** never, a bit, sometimes, mostly, always. How readily a meal cooked inside the window is offered again.
    - **Window (x days):** what counts as "recently cooked". Default 14, range 1 to 90. Meals cooked before the window are treated as fully eligible regardless of the weighting.
    - **Favourites:** include or exclude favourited dinners from suggestions. Default include.
- **FR2.8 Recency weighting is a slot quota, not a prompt adverb.** Claude will not reliably distinguish "a bit" from "sometimes". Implement as a hard constraint on how many of the three suggestion slots may contain a recently cooked meal, applied in application code before the generation call.

  | Setting | Slots of 3 that may be a repeat |
  | --- | --- |
  | never | 0 |
  | a bit | at most 1, and only when the constraint set is too narrow to produce three plausible new ideas |
  | sometimes | 1 |
  | mostly | 2 |
  | always | no constraint, recency is ignored entirely |

- **FR2.9 Favourites fill slots with saved cards, not regenerations.** When a favourite occupies a suggestion slot, surface the stored recipe card itself, badged "from your book". No API call, no drift from the version you liked, and it opens instantly. A "remix this" action on the card covers the case where a variation is wanted.
- **FR2.10** The cook log is household wide. A meal cooked by either member counts as cooked for both.

### 8.3 Ingredient bank

- **FR3.1** Ingredients belong to a category: animal protein, plant protein, healthy fat, complex carb, vegetable, fruit, dairy, herb and spice, pantry, condiment.
- **FR3.2** Each ingredient has flags: loved, disliked, staple, allergen. Disliked and allergen are exclusions; loved raises weighting in generation.
- **FR3.3** Optional per ingredient: typical unit, notes ("only the good stuff"), and seasonality.
- **FR3.4** Bulk add: paste a list, or tick from a seeded starter set of roughly 150 common ingredients on first run so the bank is useful in minute one rather than after an evening of typing.
- **FR3.5** Search, filter by category, and sort by most used.
- **FR3.6** When a generated recipe uses something outside the bank, offer a one tap "add to bank" on the recipe card.
- **FR3.7** Deleting an ingredient does not break saved recipes. Recipes store their own ingredient text.

### 8.4 Generation

- **FR4.1** Suggestions endpoint returns exactly three suggestions matching the schema in section 9.2.
- **FR4.2** Recipe endpoint returns one recipe matching the schema in section 9.3.
- **FR4.3** Both endpoints accept an optional `feedback` string and an array of previously rejected items to avoid.
- **FR4.4** All generation happens server side. The API key is never sent to the browser.
- **FR4.5** Generation is streamed or shows staged progress. A blank spinner for eight seconds feels broken. Show the suggestion titles as they arrive.
- **FR4.6** On failure: retry once automatically, then show a clear error with a retry button. Never show a half parsed recipe.
- **FR4.7** Every generation stores its inputs, outputs, model, token counts and latency for cost tracking and prompt iteration.
- **FR4.8** Quantities in steps must reference ingredient ids, not literal numbers, so scaling stays consistent between the ingredient list and the directions.

### 8.5 Scaling and units

- **FR5.1** All quantities are stored canonically in metric base units (g, ml, C) with a display conversion at render time.
- **FR5.2** Scaling is linear by default and applied client side, with no API call.
- **FR5.3** Ingredients can be marked `scales: linear | fixed | sublinear` by the model. Salt, spices, oil for frying and water for boiling are typically sublinear or fixed. Sublinear applies a square root style damping rather than a multiply.
- **FR5.4** If the serving count changes by more than a factor of two, offer a "re check this recipe at [n] servings" button that regenerates timings, pan sizes and seasoning. Do not do this automatically.
- **FR5.5** Rounding must be sensible: 1.33 eggs becomes "1 to 2 eggs", 187.5g becomes 190g, 0.75 tsp stays 3/4 tsp. Fractional whole items are never shown as decimals.
- **FR5.6** Imperial conversion uses UK conventions (pints of 568ml, no US cups by default) unless the user opts into cups.

### 8.6 Cooking mode

- **FR6.1** Uses the Screen Wake Lock API. Released on navigating away, on manual exit, and reacquired when the tab becomes visible again.
- **FR6.2** If Wake Lock is unsupported, fall back to a muted looping video element and tell the user honestly that it might not hold.
- **FR6.3** Large type, one step per screen, swipe or tap to advance, progress indicator, ingredient list reachable in one tap without losing your place.
- **FR6.4** Steps with a duration show a start timer button inline.
- **FR6.5** Steps can be ticked off and stay ticked if you leave and return.

### 8.7 Timers

- **FR7.1** Multiple concurrent named timers.
- **FR7.2** Timers are timestamp based, not interval based, so backgrounding the tab or locking the phone does not lose time.
- **FR7.3** Audible alarm via Web Audio, plus vibration where supported, plus a Notifications API alert if permission was granted.
- **FR7.4** A persistent bar at the top of cooking mode shows the nearest expiring timer.
- **FR7.5** A manual timer is reachable from anywhere on the recipe card in one tap.

### 8.8 Recipe book

- **FR8.1** Saved recipes, shared across the household, with the attribution described in section 4.
- **FR8.2** Filters: favourited by me, favourited by both, added by, cuisine, protein, total time, last cooked, never cooked.
- **FR8.3** Full text search over title, ingredients and description.
- **FR8.4** Manual editing of a saved recipe. If someone edits, record who and when.
- **FR8.5** "Cook again" opens the card at the saved serving count.
- **FR8.6** Export a single recipe as markdown or print friendly HTML.
- **FR8.7** Saved recipes are available offline.

### 8.9 Shopping list

- **FR9.1** One active list per household plus an archive of completed lists.
- **FR9.2** Add from a recipe card at the current serving count, or in bulk from selected recipes in the book ("build a list from these five").
- **FR9.3** Identical ingredients merge and quantities sum, with unit normalisation (200g plus 0.5kg becomes 700g). Items that cannot be merged safely are listed separately rather than merged wrongly.
- **FR9.4** Each item shows which recipes it came from, so removing a recipe removes the right amount.
- **FR9.5** Staples are excluded by default, with a per list toggle to include them.
- **FR9.6** Manual items can be added freely.
- **FR9.7** Items are tickable, tick state syncs between the two of you in near real time. One person in the shop, one at home adding to the list, is a real scenario.
- **FR9.8** Grouped by supermarket aisle. Aisle mapping is a static lookup table by ingredient category, not an API call.
- **FR9.9** Export for Claude Cowork: see section 10.

### 8.10 Cook log

- **FR10.1** "Mark as cooked" records recipe, date, and who cooked it.
- **FR10.2** Optional rating out of five and a free text note ("halve the chilli next time"). Notes appear on the card next time it is opened.
- **FR10.3** Repeat suppression follows the suggestion variety settings in FR2.7 to FR2.9. The cook log is the source of truth for what counts as recent.
- **FR10.4** A "recently cooked" view, and a "we have not made this in ages" prompt on the home screen.

### 8.11 Needs using up

- **FR11.1** An optional free text field in the meal builder naming ingredients that must be used. Nothing persists: it is typed when it applies and empty the rest of the time.
- **FR11.2** The text is passed to the generator verbatim as a hard requirement. Because it is free text, nuance comes for free and needs no extra controls: "chicken breast must go, tenderstem if it fits" is understood without a `must_use` toggle.
- **FR11.2a** As you type, matches against the ingredient bank are shown as chips so you can see it has understood you. Unmatched text is still passed through. The matching is a local string comparison against the bank, not an API call.
- **FR11.3** Each suggestion reports which of the named ingredients it uses and what else it needs. Suggestions requiring nothing beyond the selection and your staples are badged "nothing to buy" and sorted first.
- **FR11.4** Dietary rules, equipment, allergens and the suggestion variety settings apply as they do everywhere else. This is a field on an existing screen, not a second engine.
- **FR11.5** If no sensible dish can be built from what is named, say so plainly and offer the nearest thing plus the two or three items that would unlock it. Do not invent a dish that does not work.

---

## 9. AI integration

### 9.1 Models and calls

| Call | Model | Why |
| --- | --- | --- |
| Flavour layer suggestions | `claude-haiku-4-5-20251001` | Short, list shaped, latency sensitive, called often |
| Three dinner suggestions | `claude-sonnet-5` | Needs taste and constraint juggling, still fast |
| Full recipe card | `claude-sonnet-5` | The quality bearing call. Upgrade to `claude-opus-5` only if quality proves insufficient |
| Shopping list aisle grouping | none | Static lookup table. Do not spend tokens on this |

Use **structured outputs** (`output_config.format` with a JSON schema) rather than prompting for JSON and hoping. This is generally available on Claude 4.5 and later models and removes an entire class of parsing failure. Set `additionalProperties: false` on every object in the schema, and keep value range constraints in Zod on your side rather than in the schema sent to Claude.

Use **prompt caching** on the system prompt and the serialised ingredient bank, settings and dietary rules. That block is large, near identical between calls, and read on every generation. Cache reads cost a tenth of standard input.

**Rough cost per generation** at Sonnet 5 introductory rates of $2 per million input and $10 per million output: a suggestion call at roughly 3k input and 1k output is around $0.016; a recipe card at roughly 4k input and 2.5k output is around $0.033. A heavy week of fourteen dinners with a few refreshes lands under a pound. Verify current rates at claude.com/pricing before you set a budget, and instrument token usage from day one rather than discovering it on a card statement.

### 9.2 Suggestion schema

```json
{
  "suggestions": [
    {
      "id": "string",
      "meal_type": "dinner",
      "title": "string",
      "pitch": "string, one sentence, max 140 chars",
      "cuisine": "string",
      "components": {
        "protein": "string",
        "fat": "string",
        "carb": "string",
        "veg": ["string"]
      },
      "flavour_layer": "string",
      "total_minutes": 0,
      "active_minutes": 0,
      "difficulty": "easy | medium | involved",
      "equipment": ["string"],
      "ingredients_not_in_bank": ["string"],
      "why_this": "string, one sentence tying it to their bank or feedback"
    }
  ]
}
```

### 9.3 Recipe schema

```json
{
  "title": "string",
  "meal_type": "dinner",
  "description": "string",
  "cuisine": "string",
  "base_servings": 2,
  "total_minutes": 0,
  "active_minutes": 0,
  "difficulty": "easy | medium | involved",
  "equipment": ["string"],
  "ingredients": [
    {
      "id": "ing_1",
      "item": "chicken thighs, boneless and skinless",
      "amount": 400,
      "unit": "g",
      "prep": "cut into 3cm pieces",
      "component": "protein | fat | carb | veg | fruit | aromatic | pantry | flavour_layer",
      "scales": "linear | sublinear | fixed",
      "optional": false,
      "in_bank": true
    }
  ],
  "steps": [
    {
      "n": 1,
      "text": "Toss {ing_1} with {ing_4} and leave for 15 minutes.",
      "duration_seconds": 900,
      "temperature_c": null,
      "equipment": []
    }
  ],
  "serving_suggestion": "string",
  "make_ahead": "string or null",
  "leftovers": "string or null"
}
```

Steps reference ingredients by id in curly braces. The client substitutes the scaled, unit converted quantity at render time. This is the single most important technical decision in the document: it is what makes the servings stepper work without a second API call, and what makes the shopping list trustworthy.

### 9.4 Prompt inputs

Every generation call receives, in a cacheable block: household settings, equipment list, unit preferences, dietary rules and allergens, spice tolerance, the ingredient bank grouped by category with flags, and the cook log for the configured recency window. Then, uncached: the current builder constraints including the "needs using up" text, any user feedback text, the number of slots available for new ideas after the recency quota is applied, and the list of items to avoid repeating.

### 9.5 Guardrails

- Allergens are enforced in code as well as in the prompt. Post generation, every ingredient is checked against the allergen list and the card is rejected and regenerated if it matches. Do not trust a language model as your only line of defence on an allergy.
- Equipment is enforced in the prompt and flagged in the UI if violated.
- Free text feedback is user content, not instructions to the system. Pass it inside a delimited block and do not let it override dietary or allergen rules.

---

## 10. Claude Cowork export

A button on the shopping list produces a copyable block and a downloadable `.md` file, in this shape:

```
I want to place a grocery order at [SUPERMARKET] for delivery on [DAY].

Please find each item below, choose a sensible pack size (round up rather
than down), add it to my basket, and tell me anything you could not find
or had to substitute before checking out. Do not complete the checkout.

Preferences: [free text from settings, e.g. own brand is fine except for
olive oil and coffee, free range eggs only, no palm oil]

FRESH PRODUCE
- Onions, 4 medium
- Coriander, 2 bunches
...

MEAT AND FISH
- Chicken thighs, boneless and skinless, 800g
...

[etc, grouped by aisle]

These are for: [list of recipe titles]
```

Note the explicit instruction not to complete checkout. Whoever runs this prompt should be the one pressing buy.

---

## 11. Data model

```
users            id, email, display_name, avatar_colour, created_at
households       id, name, owner_id, created_at
memberships      user_id, household_id, role
settings         household_id, units_weight, units_volume, units_temp,
                 show_gas_mark, spice_tolerance, eating_notes, supermarket,
                 delivery_day, shopping_notes, daily_generation_cap,
                 only_new, recency_weighting, recency_window_days,
                 include_favourites,
                 meal_defaults (jsonb, keyed by meal_type: default_servings,
                 default_time_limit; only the dinner key is used in v1)
equipment        household_id, name, available
dietary_rules    id, user_id, type (allergen|avoid|diet), value
ingredients      id, household_id, name, category, typical_unit,
                 loved, disliked, staple, allergen, notes, use_count,
                 suitable_meal_types (text[], null means any, unused in v1)
recipes          id, household_id, created_by, meal_type, title, description,
                 cuisine, base_servings, total_minutes, active_minutes, difficulty,
                 payload (jsonb, the full schema from 9.3),
                 source_suggestion_id, generation_id, created_at, edited_by,
                 edited_at
favourites       recipe_id, user_id, created_at
cook_log         id, recipe_id, household_id, meal_type, cooked_by, cooked_at,
                 servings, rating, note
shopping_lists   id, household_id, name, status (active|archived), created_at
list_items       id, list_id, item, amount, unit, category, aisle,
                 source_recipe_ids (array), added_by, ticked, ticked_by,
                 is_manual
generations      id, household_id, user_id, meal_type,
                 type (flavour|suggestions|recipe), model, input_tokens, output_tokens, latency_ms, cost_usd,
                 request (jsonb), response (jsonb), feedback, created_at
```

**On `meal_type`.** An enum of `dinner`, `breakfast`, `lunch`, `snack`, `side`, defaulting to `dinner` and hard set to `dinner` throughout v1. It exists now because retrofitting it later means a migration across recipes, the cook log and every generation record, plus a rewrite of the repeat suppression query. Two rules follow from it: repeat suppression is scoped by meal type, so kedgeree for breakfast does not block kedgeree for dinner; and prompt templates take the meal type as a parameter rather than hardcoding the word dinner. Filters and settings for other meal types stay hidden until those meal types exist.

Recipes store their full payload as JSON rather than normalising ingredients into rows. A saved recipe is an immutable artefact; you never want a change to the ingredient bank to silently rewrite a recipe you cooked last month.

---

## 12. Technical architecture

**Stack**

| Layer | Choice | Reasoning |
| --- | --- | --- |
| Framework | Next.js (App Router), TypeScript | Server routes hold the API key, deploys to Vercel with no configuration |
| Hosting | Vercel, custom domain `dins.bray.life` | Already your setup. Add the CNAME on bray.life, Vercel handles TLS |
| Database and auth | Supabase (Postgres, Auth, Realtime, Row Level Security) | Auth, database and the live shopping list sync in one service. RLS scoped by household_id means data isolation is enforced by the database, not by remembering to filter |
| Validation | Zod, shared between API routes and client | One schema definition, used for both the Claude structured output schema and runtime validation |
| Styling | Tailwind, plus a small component set | Fast, and the app is mostly lists, cards and steppers |
| State | React Query for server state, local state elsewhere | No Redux for an app this size |
| AI | `@anthropic-ai/sdk` in server routes only | Key stays in Vercel environment variables |
| PWA | Web app manifest, service worker via Serwist or similar | Installable to the home screen, offline recipe book |
| CI | GitHub to Vercel preview deployments on every branch | Standard, no extra work |

**Alternative worth considering:** Vercel Postgres with Auth.js instead of Supabase. Fewer services, but you lose Realtime, which is what makes the shared shopping list tick state sync properly while one of you is standing in an aisle. I would take Supabase.

**Environment variables:** `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_SIGNUP_EMAILS`.

**Route handlers**

```
POST /api/flavours      -> flavour layer options
POST /api/suggestions   -> three dinner suggestions
POST /api/recipe        -> one recipe card
POST /api/recipe/revise -> regenerate with feedback
POST /api/shopping/export -> Cowork prompt text
```

All of them authenticated, all of them rate limited per user per day, all of them logging to `generations`.

---

## 13. Non functional requirements

- **Mobile first.** This is used standing in a kitchen holding a phone with one greasy hand. Design for a 390px viewport and thumb reach. Desktop is a courtesy.
- **Latency.** Flavour options under 3 seconds. Suggestions under 8 seconds with streamed titles. Recipe card under 15 seconds with progressive rendering. Anything that will exceed these must show what it is doing.
- **Offline.** Saved recipes, the ingredient bank and the active shopping list must be readable offline. Generation obviously requires a connection and should say so plainly.
- **Accessibility.** Cooking mode text at least 20px. Contrast ratio 4.5:1 minimum. Timer alerts audible and visible, never colour alone.
- **Cost control.** Daily generation cap per user, visible token spend in settings, and a hard monthly ceiling that disables generation and emails the owner.
- **Security.** Row Level Security on every table. Closed signup. No API key in the client bundle. Feedback text treated as data, never as instruction.
- **Privacy.** No analytics beyond what you host yourself. This is a record of what two people eat and it does not need to be anyone else's business.

---

## 14. Build order

You asked for everything in v1. That is achievable, but it still needs sequencing, because half of these features cannot be tested without the ones before them.

1. Auth, household, settings, ingredient bank. Nothing works without the constraint inputs.
2. Suggestions and recipe generation with structured outputs, rendered as a static card. This is the risky bit: prove the prompts produce food you would actually eat before building anything around them.
3. The "needs using up" field. A field and a prompt change, but it exercises the generator hard enough to expose its weaknesses early.
4. Scaling, unit conversion, rounding rules.
5. Save, favourite, recipe book, attribution.
6. Cooking mode, wake lock, timers.
7. Shopping list, merging, realtime tick sync.
8. Cowork export.
9. Cook log and repeat suppression.
10. PWA shell, offline caching, install prompt.

Step 2 is where the project either works or does not. Everything after it is ordinary web application work. If the suggestions are bland, the rest of the app is a very nice wrapper around a disappointment, so spend the prompt iteration time there and use the `generations` table to actually review what it produced.

---

## 15. Risks

| Risk | Mitigation |
| --- | --- |
| Generated recipes are plausible but wrong (bad timings, wrong quantities, dishes that do not work) | Rating and note on the cook log, reviewed against the `generations` log. Constrain to techniques the model handles reliably. Prefer fewer, better prompted calls over more features |
| Suggestions converge on the same handful of dishes | Cook log suppression, explicit avoid list on refresh, and deliberate variety instruction in the prompt |
| The funnel gets long and you stop using it | Surprise us stays on the home screen and stays one tap. Guard this in review |
| API costs run away, or someone finds the domain | Closed signup, per user daily cap, monthly ceiling |
| Allergen or dietary failure | Enforced in code after generation, not just in the prompt |
| Wake lock unreliable on iOS Safari | Fallback and honest messaging. Do not promise the screen will stay on |
| The ingredient bank becomes a chore to maintain | Seeded starter set, one tap add from recipe cards, and never make the bank a blocker for generating |

---

## 16. Decision record

Resolved on 1 August 2026:

1. **Only new** excludes anything already in the recipe book, including recipes saved but never cooked or favourited.
2. **Using up what is in the fridge is a free text field in the builder**, not a persistent list or a separate mode. See section 7.3 and FR11. The home screen "use it up" button deep links to the builder with that field focused.
3. **Breakfast and lunch are deferred**, but `meal_type` is in the schema from the start and prompt templates are parameterised by it. No migration required to add them.
4. **No drink pairings.**

Nothing outstanding. The next revision of this document should follow the first week of real cooking, not the next round of ideas.
