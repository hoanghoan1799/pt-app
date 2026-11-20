import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UseGuards,
} from "@nestjs/common";

import type { AuthActor } from "../auth/actor.js";
import type { AuthedRequest } from "../auth/decorators/index.js";
import { RestrictedError } from "./restrictions.errors.js";

// The one shared helper for the spec's "Guarded actions": a trainee under an
// active super admin restriction may not write (chat, DM, posts, comments,
// reactions, bio, friend requests, photo uploads). Reading and taking their own
// content back stay allowed, so those routes do not use it (D11). Admins are
// never restricted.
//
// The actor's `restriction` is loaded with the session on every request
// (SessionQueries), so this needs no query. A suspended trainee never gets
// here: their session is rejected (D4). The restriction on the actor is the
// one active at Clock.now() when the session loaded.
export const assertNotRestricted = (actor: AuthActor | undefined) => {
  if (actor?.kind === "user" && actor.restriction !== null) {
    throw new RestrictedError();
  }
};

@Injectable()
export class RestrictedWriteGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    // Socket.IO events are authenticated by the handshake (RealtimeAuth),
    // whose actor can be older than the block. The only socket event that
    // reaches other people today is "typing", which the spec leaves open; a
    // socket write added later asks RestrictionQueries.findActive itself.
    if (context.getType() !== "http") {
      return true;
    }
    assertNotRestricted(
      context.switchToHttp().getRequest<AuthedRequest>().actor,
    );
    return true;
  }
}

// On a write route (method or controller): a restricted trainee gets 403
// RESTRICTED. Runs after the global session, role and PT scope guards and
// after any controller-level guard (the social terms come first).
export const RefuseRestricted = () =>
  applyDecorators(UseGuards(RestrictedWriteGuard));
