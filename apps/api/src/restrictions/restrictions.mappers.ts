import type { ActiveRestrictionResponse } from "@pt/contracts";

import type { ActiveRestriction } from "./restriction.sql.js";

// The one shape of an active block on the wire: GET /auth/me (the trainee's
// banner) and the super admin routes.
export const toActiveRestrictionResponse = (
  restriction: ActiveRestriction,
): ActiveRestrictionResponse => ({
  id: restriction.id,
  level: restriction.level,
  until: restriction.until ? restriction.until.toISOString() : null,
  reason: restriction.reason,
  createdAt: restriction.createdAt.toISOString(),
});
