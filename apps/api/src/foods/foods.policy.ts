import { Injectable } from "@nestjs/common";

import type { AuthActor } from "../auth/actor.js";
import { RoleForbiddenError } from "../auth/auth.errors.js";

// The food library is shared by everyone and has no PT scope: any signed-in
// actor reads it, only a super admin changes it (requireSuperAdmin() in the
// web). A PT account is refused, and so is a trainee.
@Injectable()
export class FoodsPolicy {
  canManage(actor: AuthActor) {
    return actor.kind === "admin" && actor.role === "super_admin";
  }

  assertCanManage(actor: AuthActor) {
    if (!this.canManage(actor)) {
      throw new RoleForbiddenError();
    }
  }
}
