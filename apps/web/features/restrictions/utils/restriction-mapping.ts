import type { ActiveRestrictionResponse } from "@pt/contracts";

import type { ActiveRestriction } from "@/features/restrictions/types/restriction";

// API block (ISO dates) -> the UI's (epoch ms).
export const toActiveRestriction = (
  restriction: ActiveRestrictionResponse,
): ActiveRestriction => ({
  id: restriction.id,
  level: restriction.level,
  until: restriction.until === null ? null : Date.parse(restriction.until),
  reason: restriction.reason,
  createdAt: Date.parse(restriction.createdAt),
});

// The `details` of the API's ACCOUNT_SUSPENDED login refusal: the end (or
// permanent) and the reason. Null when they are not there.
export const parseSuspensionDetails = (
  details: Record<string, string | number | boolean> | undefined,
): { until: number | null; reason: string } | null => {
  if (!details || typeof details.reason !== "string") {
    return null;
  }
  if (details.permanent === true) {
    return { until: null, reason: details.reason };
  }
  const until =
    typeof details.until === "string" ? Date.parse(details.until) : NaN;

  return Number.isFinite(until) ? { until, reason: details.reason } : null;
};
