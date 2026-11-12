import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { RoleForbiddenError, TraineeNotFoundError } from "../auth.errors.js";
import {
  type AuthedRequest,
  TRAINEE_SCOPE_KEY,
  type TraineeScopeMeta,
} from "../decorators/index.js";
import { PtScopePolicy } from "../policies/pt-scope.policy.js";
import { TraineeScopeQueries } from "../trainee-scope.queries.js";

// Step 3: the resource. For routes marked @ScopedToTrainee(), asks the
// PtScopePolicy whether this admin may work with the trainee in `:userId` (or
// the owner of `:cid`). Out of scope, hidden without a reveal and missing all
// answer the same 404, so nothing leaks.
@Injectable()
export class PtScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PtScopePolicy,
    private readonly queries: TraineeScopeQueries,
  ) {}

  async canActivate(context: ExecutionContext) {
    // Socket.IO events are authenticated by the handshake (RealtimeAuth).
    if (context.getType() !== "http") {
      return true;
    }

    const meta = this.reflector.getAllAndOverride<TraineeScopeMeta | undefined>(
      TRAINEE_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const actor = request.actor;

    if (actor?.kind !== "admin") {
      throw new RoleForbiddenError();
    }

    const raw: unknown = (request.params as Record<string, unknown>)[
      meta.param
    ];
    const id =
      typeof raw === "string" && /^\d{1,9}$/.test(raw) ? Number(raw) : NaN;

    if (!Number.isInteger(id) || id < 1) {
      throw new TraineeNotFoundError();
    }

    const facts =
      meta.source === "user"
        ? await this.queries.findByUserId(actor.id, id)
        : await this.queries.findByConversationId(actor.id, id);

    if (
      !facts ||
      !this.policy.canAccessTrainee(actor, facts, {
        ignoreHidden: meta.ignoreHidden,
      })
    ) {
      throw new TraineeNotFoundError();
    }
    request.scopedUserId = facts.userId;
    return true;
  }
}
