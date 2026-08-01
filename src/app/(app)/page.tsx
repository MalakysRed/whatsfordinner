import { requireHouseholdSession } from "@/lib/auth/session";
import { EmptyState } from "@/components/ui";

/**
 * Home. Filled in properly in the generation milestone — this is the screen the
 * whole product is judged on, and it stays one tap to a suggestion.
 */
export default async function HomePage() {
  await requireHouseholdSession();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">What&rsquo;s for dinner?</h1>

      <EmptyState title="Not wired up yet">
        Set up the ingredient bank and your settings first. Suggestions land here
        next.
      </EmptyState>
    </div>
  );
}
