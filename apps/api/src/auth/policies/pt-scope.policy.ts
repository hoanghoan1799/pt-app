import { Injectable } from "@nestjs/common";

import type { AdminActor } from "../actor.js";

// What the policy needs to know about a trainee.
export type TraineeScopeFacts = {
  ptAdminId: number | null;
  // True when this admin hid the trainee (admin_hidden_users).
  hidden: boolean;
};

export type ScopeOptions = {
  // Hide / unhide: the hidden state itself is the point, only scope applies.
  ignoreHidden?: boolean;
};

// PT workspace and hidden-trainee rules, ported from admin-scope.ts and
// hidden-users.ts. A plain class with no I/O: the riskiest rules in the app, so
// they are unit-tested on their own. A mistake here is a privacy regression.
@Injectable()
export class PtScopePolicy {
  // A super admin works with every trainee; a PT only with trainees assigned
  // to them (users.pt_admin_id); an unassigned trainee belongs to no PT.
  isInWorkspace(
    admin: Pick<AdminActor, "id" | "role">,
    trainee: TraineeScopeFacts,
  ) {
    return admin.role === "super_admin" || trainee.ptAdminId === admin.id;
  }

  // In the workspace, and not hidden by this admin unless they revealed hidden
  // trainees with the passcode on this session. A locked admin gets nothing.
  canAccessTrainee(
    admin: AdminActor,
    trainee: TraineeScopeFacts,
    options: ScopeOptions = {},
  ) {
    if (admin.locked || !this.isInWorkspace(admin, trainee)) {
      return false;
    }
    return options.ignoreHidden || !trainee.hidden || admin.revealed;
  }
}
