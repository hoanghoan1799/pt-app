import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { SessionInvalidError } from "../auth.errors.js";
import { type AuthedRequest, IS_PUBLIC_KEY } from "../decorators/index.js";
import { parseBearer } from "../session-token.js";
import { SessionsService } from "../sessions.service.js";

// Step 1 of the chain: WHO is calling. Reads `Authorization: Bearer <token>`
// (nothing else: no cookies, no query string), hashes it and loads the
// session. Public routes skip it.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    // Socket.IO events are authenticated by the handshake (RealtimeAuth).
    if (context.getType() !== "http") {
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = parseBearer(request.headers.authorization);
    const actor = token ? await this.sessions.authenticate(token) : null;

    if (!actor) {
      throw new SessionInvalidError();
    }
    request.actor = actor;
    return true;
  }
}
