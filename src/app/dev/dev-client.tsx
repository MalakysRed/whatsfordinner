"use client";

import { useActionState } from "react";
import { Card, Select, Input, Button, Label } from "@/components/ui";
import {
  inviteFriendToApp,
  generateLockedOptions,
  type InviteResult,
  type SeedLabResult,
} from "./actions";
import type { SeedAxis } from "@/lib/db/types";

const initialInvite: InviteResult = { status: "idle" };
const initialSeedLab: SeedLabResult = { status: "idle" };

const BANDS = [
  { value: "quick", label: "Quick — 30 mins or less" },
  { value: "standard", label: "Standard — 30-60 mins" },
  { value: "project", label: "Project — 60 mins plus" },
] as const;

const AXES: { value: SeedAxis; label: string }[] = [
  { value: "cuisine", label: "Cuisine" },
  { value: "format", label: "Format" },
  { value: "hero", label: "Hero ingredient" },
];

export function DevClient({ seedNames }: { seedNames: Record<SeedAxis, string[]> }) {
  return (
    <div className="space-y-10">
      <InviteFriend />
      <SeedLab seedNames={seedNames} />
    </div>
  );
}

function InviteFriend() {
  const [state, formAction, pending] = useActionState(inviteFriendToApp, initialInvite);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Invite a friend</h2>
        <p className="text-sm leading-relaxed text-muted">
          Grants app access without joining your household — they land on their own
          &ldquo;Set up your kitchen&rdquo; screen and build a household of their own.
        </p>
      </div>

      <Card className="p-4">
        <form action={formAction} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="friend_email">Their email</Label>
            <Input
              id="friend_email"
              name="email"
              type="email"
              placeholder="friend@example.com"
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Inviting…" : "Send invite"}
            </Button>
            {state.status === "sent" && (
              <span role="status" className="text-sm text-success">
                {state.message}
              </span>
            )}
            {state.status === "error" && (
              <span role="alert" className="text-sm text-danger">
                {state.message}
              </span>
            )}
          </div>
        </form>
      </Card>
    </section>
  );
}

function SeedLab({ seedNames }: { seedNames: Record<SeedAxis, string[]> }) {
  const [state, formAction, pending] = useActionState(generateLockedOptions, initialSeedLab);

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Seed lab</h2>
        <p className="text-sm leading-relaxed text-muted">
          Lock a specific seed per axis instead of leaving the draw to chance — every
          slot that would have drawn that axis uses it, the rest still runs through
          the real generation call.
        </p>
      </div>

      <Card className="p-4">
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="effort_band">Effort band</Label>
            <Select id="effort_band" name="effort_band" defaultValue="standard">
              {BANDS.map((band) => (
                <option key={band.value} value={band.value}>
                  {band.label}
                </option>
              ))}
            </Select>
          </div>

          {AXES.map((axis) => (
            <div key={axis.value} className="space-y-2">
              <Label htmlFor={`lock_${axis.value}`}>{axis.label}</Label>
              <Select id={`lock_${axis.value}`} name={`lock_${axis.value}`} defaultValue="">
                <option value="">Random</option>
                {seedNames[axis.value].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
          ))}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Generating…" : "Generate"}
            </Button>
            {state.status === "error" && (
              <span role="alert" className="text-sm text-danger">
                {state.message}
              </span>
            )}
          </div>
        </form>
      </Card>

      {state.status === "done" && state.options && (
        <div className="space-y-3">
          {state.options.map((option, i) => (
            <Card key={option.id} className="space-y-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">
                Slot {i + 1} — {state.seeds?.[i]?.axis}: {state.seeds?.[i]?.name}
              </p>
              <h3 className="text-base font-semibold leading-tight">{option.direction}</h3>
              <p className="text-sm text-detail">
                {option.cuisine} · {option.effort_minutes} min
              </p>
              <p className="text-sm text-flavour">
                {[...option.flavours, ...option.textures].join(", ")}
              </p>
              <p className="text-sm text-hero">{option.hero_ingredients.join(", ")}</p>
              <p className="text-sm text-muted">{option.description}</p>
              <p className="text-sm italic text-muted">{option.distinguishing_note}</p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
