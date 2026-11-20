import type { RestrictionLevel } from "@pt/contracts";

export type { RestrictionDuration, RestrictionLevel } from "@pt/contracts";

// What the UI shows about an active restriction.
export interface ActiveRestriction {
  id: number;
  level: RestrictionLevel;
  // Epoch milliseconds, null = permanent. Plain numbers so it can cross into
  // client components.
  until: number | null;
  reason: string;
  createdAt: number;
}
