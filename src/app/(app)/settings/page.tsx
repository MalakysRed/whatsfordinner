import { requireHouseholdSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { Card, Label, Input, Pill, Section, Select, Textarea } from "@/components/ui";
import { SaveForm } from "@/components/save-form";
import { InstallPrompt } from "@/components/install-prompt";
import { SPICE_LABELS } from "@/lib/schemas/settings";
import type {
  DietaryRuleRow,
  EquipmentRow,
  MealDefaults,
  SettingsRow,
  UserRow,
} from "@/lib/db/types";
import { VarietySection } from "./variety-section";
import {
  addDietaryRule,
  createInvite,
  removeDietaryRule,
  saveEquipment,
  saveGenerationSettings,
  saveHouseholdDefaults,
  saveMeasurements,
  saveShopping,
} from "./actions";

export default async function SettingsPage() {
  const session = await requireHouseholdSession();
  const supabase = await createClient();

  const [
    { data: settings },
    { data: equipment },
    { data: rules },
    { data: members },
  ] = await Promise.all([
    supabase.from("settings").select("*").eq("household_id", session.householdId).single(),
    supabase
      .from("equipment")
      .select("*")
      .eq("household_id", session.householdId)
      .order("name"),
    supabase.from("dietary_rules").select("*").eq("household_id", session.householdId),
    supabase
      .from("memberships")
      .select("role, users(id, email, display_name)")
      .eq("household_id", session.householdId),
  ]);

  if (!settings) {
    return <p className="text-muted">Could not load settings.</p>;
  }

  const typedSettings = settings as SettingsRow;
  const dinnerDefaults: MealDefaults = typedSettings.meal_defaults?.dinner ?? {
    default_servings: 2,
    default_time_limit: null,
  };

  const memberRows = (members ?? []) as unknown as {
    role: string;
    users: UserRow;
  }[];

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </header>

      <InstallPrompt />

      {/* FR2.3 */}
      <Section
        title="How you eat"
        description="The starting point for every suggestion."
      >
        <SaveForm action={saveHouseholdDefaults}>
          <div className="space-y-2">
            <Label htmlFor="default_servings">Usually cooking for</Label>
            <div className="flex items-center gap-3">
              <Input
                id="default_servings"
                name="default_servings"
                type="number"
                min={1}
                max={12}
                defaultValue={dinnerDefaults.default_servings}
                className="w-24"
              />
              <span className="text-base text-muted">people</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="default_time_limit">Default time limit</Label>
            <Select
              id="default_time_limit"
              name="default_time_limit"
              defaultValue={dinnerDefaults.default_time_limit ?? ""}
            >
              <option value="">No limit</option>
              <option value="30">Under 30 minutes</option>
              <option value="60">Under 60 minutes</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spice_tolerance">Heat</Label>
            <Select
              id="spice_tolerance"
              name="spice_tolerance"
              defaultValue={typedSettings.spice_tolerance}
            >
              {Object.entries(SPICE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="eating_notes">Things to know about how we eat</Label>
            <Textarea
              id="eating_notes"
              name="eating_notes"
              rows={3}
              defaultValue={typedSettings.eating_notes ?? ""}
              placeholder="We eat late, we hate coriander, one of us will not touch an olive."
            />
          </div>
        </SaveForm>
      </Section>

      {/* FR2.4 */}
      <Section
        title="Allergies and avoidances"
        description="Yours only. Everyone's rules are combined and applied to every suggestion — an allergen for one of you is excluded for both."
      >
        <div className="space-y-3">
          {rules && rules.length > 0 && (
            <ul className="space-y-2">
              {(rules as DietaryRuleRow[]).map((rule) => (
                <li key={rule.id}>
                  <Card className="flex items-center justify-between gap-3 p-3">
                    <span className="flex items-center gap-2 text-base">
                      <Pill tone={rule.type === "allergen" ? "danger" : "neutral"}>
                        {rule.type === "allergen"
                          ? "Allergen"
                          : rule.type === "avoid"
                            ? "Avoid"
                            : "Diet"}
                      </Pill>
                      {rule.value}
                    </span>
                    {rule.user_id === session.userId && (
                      <form action={removeDietaryRule}>
                        <input type="hidden" name="id" value={rule.id} />
                        <button
                          type="submit"
                          className="min-h-11 px-2 text-sm text-muted underline"
                        >
                          Remove
                        </button>
                      </form>
                    )}
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <SaveForm action={addDietaryRule} submitLabel="Add rule">
            <div className="flex gap-2">
              <Select name="type" defaultValue="allergen" className="w-36">
                <option value="allergen">Allergen</option>
                <option value="avoid">Avoid</option>
                <option value="diet">Diet</option>
              </Select>
              <Input name="value" placeholder="Peanuts" />
            </div>
            <p className="text-sm text-muted">
              Allergens are a hard exclusion, checked in code after every
              generation as well as in the prompt. Avoidances are never suggested
              but are not treated as dangerous.
            </p>
          </SaveForm>
        </div>
      </Section>

      {/* FR2.1 */}
      <Section
        title="Equipment"
        description="Suggestions are limited to what you can actually cook with."
      >
        <SaveForm action={saveEquipment}>
          <Card className="divide-y divide-line">
            {(equipment ?? []).map((item: EquipmentRow) => (
              <label
                key={item.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-2.5"
              >
                <input
                  type="checkbox"
                  name="equipment"
                  value={item.id}
                  defaultChecked={item.available}
                  className="size-5 shrink-0 accent-[var(--accent)]"
                />
                <span className="text-base">{item.name}</span>
              </label>
            ))}
          </Card>

          <div className="space-y-2">
            <Label htmlFor="extra_equipment">Anything else</Label>
            <Input
              id="extra_equipment"
              name="extra_equipment"
              placeholder="Tagine, pizza stone"
            />
            <p className="text-sm text-muted">Comma separated. Added as available.</p>
          </div>
        </SaveForm>
      </Section>

      {/* FR2.7 */}
      <Section
        title="Variety"
        description="How often you are offered something you have had recently."
      >
        <VarietySection settings={typedSettings} />
      </Section>

      {/* FR2.2 */}
      <Section title="Measurements">
        <SaveForm action={saveMeasurements}>
          <div className="space-y-2">
            <Label htmlFor="units_weight">Weight</Label>
            <Select
              id="units_weight"
              name="units_weight"
              defaultValue={typedSettings.units_weight}
            >
              <option value="metric">Grams and kilograms</option>
              <option value="imperial">Ounces and pounds</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="units_volume">Volume</Label>
            <Select
              id="units_volume"
              name="units_volume"
              defaultValue={typedSettings.units_volume}
            >
              <option value="metric">Millilitres and litres</option>
              <option value="imperial">Fluid ounces and pints (UK)</option>
              <option value="us_cups">US cups</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="units_temp">Temperature</Label>
            <Select
              id="units_temp"
              name="units_temp"
              defaultValue={typedSettings.units_temp}
            >
              <option value="c">Celsius</option>
              <option value="f">Fahrenheit</option>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="units_length">Tin and pan sizes</Label>
            <Select
              id="units_length"
              name="units_length"
              defaultValue={typedSettings.units_length}
            >
              <option value="cm">Centimetres</option>
              <option value="inches">Inches</option>
            </Select>
          </div>

          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              name="show_gas_mark"
              defaultChecked={typedSettings.show_gas_mark}
              className="size-5 shrink-0 accent-[var(--accent)]"
            />
            <span className="text-base">Also show gas mark</span>
          </label>
        </SaveForm>
      </Section>

      {/* FR2.5 */}
      <Section
        title="Shopping"
        description="Used only when handing a list to Claude Cowork."
      >
        <SaveForm action={saveShopping}>
          <div className="space-y-2">
            <Label htmlFor="supermarket">Preferred supermarket</Label>
            <Input
              id="supermarket"
              name="supermarket"
              defaultValue={typedSettings.supermarket ?? ""}
              placeholder="Sainsbury's"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delivery_day">Usual delivery day</Label>
            <Input
              id="delivery_day"
              name="delivery_day"
              defaultValue={typedSettings.delivery_day ?? ""}
              placeholder="Thursday"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="shopping_notes">Brand and size preferences</Label>
            <Textarea
              id="shopping_notes"
              name="shopping_notes"
              rows={3}
              defaultValue={typedSettings.shopping_notes ?? ""}
              placeholder="Own brand is fine except olive oil and coffee. Free range eggs only. No palm oil."
            />
          </div>
        </SaveForm>
      </Section>

      {/* FR2.6 */}
      <Section
        title="Generation"
        description="Every generation costs money and the app sits on a public domain."
      >
        <SaveForm action={saveGenerationSettings}>
          <div className="space-y-2">
            <Label htmlFor="daily_generation_cap">Daily cap per person</Label>
            <Input
              id="daily_generation_cap"
              name="daily_generation_cap"
              type="number"
              min={1}
              max={500}
              defaultValue={typedSettings.daily_generation_cap}
              disabled={session.role !== "owner"}
              className="w-28"
            />
            {session.role !== "owner" && (
              <p className="text-sm text-muted">
                Only the household owner can change this.
              </p>
            )}
          </div>
        </SaveForm>
      </Section>

      {/* FR1.3, FR1.4 */}
      <Section title="Household">
        <div className="space-y-3">
          <Card className="divide-y divide-line">
            {memberRows.map(({ role, users: member }) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <span className="text-base">
                  {member.display_name ?? member.email}
                  {member.id === session.userId && (
                    <span className="text-muted"> (you)</span>
                  )}
                </span>
                {role === "owner" && <Pill>Owner</Pill>}
              </div>
            ))}
          </Card>

          {session.role === "owner" && (
            <SaveForm action={createInvite} submitLabel="Create invite">
              <div className="space-y-2">
                <Label htmlFor="invite_email">Invite someone</Label>
                <Input
                  id="invite_email"
                  name="email"
                  type="email"
                  placeholder="them@example.com"
                />
                <p className="text-sm text-muted">
                  Good for seven days. Their email is added to the allowlist so
                  they can create an account at all.
                </p>
              </div>
            </SaveForm>
          )}
        </div>
      </Section>
    </div>
  );
}
