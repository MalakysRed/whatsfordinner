/**
 * Row types for the tables in supabase/migrations.
 *
 * Hand-written for now. Once a hosted Supabase project exists, replace this with
 * `supabase gen types typescript --project-id <id>` so it cannot drift from the
 * SQL — these types are a convenience, not a source of truth. The database is.
 */

export type MealType = "dinner" | "breakfast" | "lunch" | "snack" | "side";

export type MembershipRole = "member" | "owner";

export type IngredientCategory =
  | "animal_protein"
  | "plant_protein"
  | "healthy_fat"
  | "complex_carb"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "herb_and_spice"
  | "pantry"
  | "condiment";

export type Difficulty = "easy" | "medium" | "involved";

export type DietaryRuleType = "allergen" | "avoid" | "diet";

export type SpiceTolerance = "mild" | "medium" | "hot" | "very_hot";

export type RecencyWeighting = "never" | "a_bit" | "sometimes" | "mostly" | "always";

export type GenerationType = "flavour" | "suggestions" | "recipe";

export type ListStatus = "active" | "archived";

/** Display labels for the ingredient categories, in plate order. */
export const INGREDIENT_CATEGORIES: {
  value: IngredientCategory;
  label: string;
}[] = [
  { value: "animal_protein", label: "Animal protein" },
  { value: "plant_protein", label: "Plant protein" },
  { value: "healthy_fat", label: "Healthy fat" },
  { value: "complex_carb", label: "Complex carb" },
  { value: "vegetable", label: "Vegetable" },
  { value: "fruit", label: "Fruit" },
  { value: "dairy", label: "Dairy" },
  { value: "herb_and_spice", label: "Herb and spice" },
  { value: "pantry", label: "Pantry" },
  { value: "condiment", label: "Condiment" },
];

export const CATEGORY_LABELS = Object.fromEntries(
  INGREDIENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<IngredientCategory, string>;

export interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_colour: string | null;
  created_at: string;
}

export interface HouseholdRow {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface MembershipRow {
  user_id: string;
  household_id: string;
  role: MembershipRole;
  created_at: string;
}

export interface MealDefaults {
  default_servings: number;
  default_time_limit: number | null;
}

export interface SettingsRow {
  household_id: string;
  units_weight: "metric" | "imperial";
  units_volume: "metric" | "imperial" | "us_cups";
  units_temp: "c" | "f";
  units_length: "cm" | "inches";
  show_gas_mark: boolean;
  spice_tolerance: SpiceTolerance;
  eating_notes: string | null;
  supermarket: string | null;
  delivery_day: string | null;
  shopping_notes: string | null;
  daily_generation_cap: number;
  only_new: boolean;
  recency_weighting: RecencyWeighting;
  recency_window_days: number;
  include_favourites: boolean;
  /** Keyed by meal type; only the dinner key is read in v1. */
  meal_defaults: Partial<Record<MealType, MealDefaults>>;
  updated_at: string;
}

export interface EquipmentRow {
  id: string;
  household_id: string;
  name: string;
  available: boolean;
}

export interface DietaryRuleRow {
  id: string;
  user_id: string;
  household_id: string;
  type: DietaryRuleType;
  value: string;
  created_at: string;
}

export interface IngredientRow {
  id: string;
  household_id: string;
  name: string;
  category: IngredientCategory;
  typical_unit: string | null;
  loved: boolean;
  disliked: boolean;
  staple: boolean;
  allergen: boolean;
  notes: string | null;
  seasonality: string | null;
  use_count: number;
  suitable_meal_types: MealType[] | null;
  created_at: string;
}

export interface StarterIngredientRow {
  name: string;
  category: IngredientCategory;
  typical_unit: string | null;
  staple_default: boolean;
}

export interface RecipeRow {
  id: string;
  household_id: string;
  created_by: string;
  meal_type: MealType;
  title: string;
  description: string | null;
  cuisine: string | null;
  base_servings: number;
  total_minutes: number | null;
  active_minutes: number | null;
  difficulty: Difficulty | null;
  /** The full recipe JSON from PRD 9.3. The immutable artefact. */
  payload: unknown;
  source_suggestion_id: string | null;
  generation_id: string | null;
  created_at: string;
  edited_by: string | null;
  edited_at: string | null;
}

export interface CookLogRow {
  id: string;
  recipe_id: string;
  household_id: string;
  meal_type: MealType;
  cooked_by: string;
  cooked_at: string;
  servings: number | null;
  rating: number | null;
  note: string | null;
}

export interface GenerationRow {
  id: string;
  household_id: string;
  user_id: string;
  meal_type: MealType;
  type: GenerationType;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cache_read_input_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  request: unknown;
  response: unknown;
  feedback: string | null;
  succeeded: boolean;
  error: string | null;
  created_at: string;
}
