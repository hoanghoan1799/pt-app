import { Injectable } from "@nestjs/common";

import type { AdminActor } from "../auth/actor.js";
import {
  PtScopePolicy,
  type TraineeScopeFacts,
} from "../auth/policies/pt-scope.policy.js";

// Workout rules with no I/O, unit-tested on their own.
@Injectable()
export class WorkoutsPolicy {
  constructor(private readonly scope: PtScopePolicy) {}

  // Sets and completions are logged on today's and past days only (Q7).
  isDue(date: string, today: string) {
    return date <= today;
  }

  // A week copy onto the very same week of the same trainee is a no-op the PT
  // is told about.
  isSameWeekCopy(input: {
    userId: number;
    targetUserId: number;
    sourceWeek: string;
    targetWeek: string;
  }) {
    return (
      input.userId === input.targetUserId &&
      input.sourceWeek === input.targetWeek
    );
  }

  // The second trainee of a copy must be in the admin's reach too: scope and
  // hidden rules, same as the trainee in the URL.
  canCopyInto(admin: AdminActor, target: TraineeScopeFacts | null) {
    return target !== null && this.scope.canAccessTrainee(admin, target);
  }

  // The trainee's logged sets are history: a copy never overwrites them.
  mayOverwriteDays(targetHasSets: boolean) {
    return !targetHasSets;
  }
}
