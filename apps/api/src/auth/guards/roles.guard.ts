import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { ActorRole } from "@pt/contracts";

import { toActorRole } from "../actor.js";
import { AdminLockedError, RoleForbiddenError } from "../auth.errors.js";
import {
  ALLOW_LOCKED_KEY,
  type AuthedRequest,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from "../decorators/index.js";

// Step 2: WHAT the caller is. @Roles('super_admin','pt','trainee') lists the
// allowed roles (no list = any signed-in actor). A passcode-locked admin is
// stopped on every route that is not marked @AllowLocked(), like requireAdmin()
// sending them to the lock page.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    // Socket.IO events are authenticated by the handshake (RealtimeAuth).
    if (context.getType() !== "http") {
      return true;
    }

    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const actor = context.switchToHttp().getRequest<AuthedRequest>().actor;

    if (!actor) {
      throw new RoleForbiddenError();
    }

    const roles = this.reflector.getAllAndOverride<ActorRole[] | undefined>(
      ROLES_KEY,
      targets,
    );

    if (roles && !roles.includes(toActorRole(actor))) {
      throw new RoleForbiddenError();
    }

    const allowLocked = this.reflector.getAllAndOverride<boolean>(
      ALLOW_LOCKED_KEY,
      targets,
    );

    if (actor.kind === "admin" && actor.locked && !allowLocked) {
      throw new AdminLockedError();
    }
    return true;
  }
}
