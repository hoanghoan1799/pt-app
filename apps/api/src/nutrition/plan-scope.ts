import { Injectable } from "@nestjs/common";

import type { AdminActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../auth/trainee-scope.queries.js";

// PT scope for routes whose URL names a day, meal or item instead of a
// trainee. The service finds the owner and asks here; a resource the PT may
// not reach is answered exactly like a missing one.
@Injectable()
export class PlanScope {
  constructor(
    private readonly queries: TraineeScopeQueries,
    private readonly policy: PtScopePolicy,
  ) {}

  async canAccess(admin: AdminActor, userId: number) {
    const facts = await this.queries.findByUserId(admin.id, userId);

    return facts !== null && this.policy.canAccessTrainee(admin, facts);
  }
}
