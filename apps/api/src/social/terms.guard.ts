import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SOCIAL_TERMS_VERSION } from "@pt/contracts";

import type { AuthedRequest } from "../auth/decorators/index.js";
import { SocialAccountQueries } from "./accounts.queries.js";
import { termsRequired } from "./social.errors.js";

export const SKIP_TERMS_KEY = "social:skipTerms";

// Routes a trainee may call before accepting the terms (the terms themselves,
// and the state the feed page needs to show them).
export const SkipTerms = () => SetMetadata(SKIP_TERMS_KEY, true);

// A trainee who has not accepted the current terms version is turned away from
// every social route (T1). Admins never need the terms. Runs after the global
// session and role guards, so the actor is already known.
@Injectable()
export class SocialTermsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accounts: SocialAccountQueries,
  ) {}

  async canActivate(context: ExecutionContext) {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_TERMS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const actor = context.switchToHttp().getRequest<AuthedRequest>().actor;

    if (skip || actor?.kind !== "user") {
      return true;
    }
    const version = await this.accounts.termsVersion(actor.id);

    if (version === null || version < SOCIAL_TERMS_VERSION) {
      throw termsRequired();
    }
    return true;
  }
}
