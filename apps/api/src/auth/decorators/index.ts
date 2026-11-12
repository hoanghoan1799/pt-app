import {
  applyDecorators,
  createParamDecorator,
  type ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import { ApiBearerAuth } from "@nestjs/swagger";
import { type ActorRole, ADMIN_ROLES } from "@pt/contracts";
import type { Request } from "express";

import type { AuthActor } from "../actor.js";

export const IS_PUBLIC_KEY = "auth:public";
export const ROLES_KEY = "auth:roles";
export const ALLOW_LOCKED_KEY = "auth:allowLocked";
export const TRAINEE_SCOPE_KEY = "auth:traineeScope";

// The request after the guards ran.
export type AuthedRequest = Request & {
  actor?: AuthActor;
  // Set by the PtScopeGuard: the trainee the route is about.
  scopedUserId?: number;
};

// No session needed (login only).
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// Any of these roles; omit for "any signed-in actor".
export const Roles = (...roles: ActorRole[]) =>
  applyDecorators(SetMetadata(ROLES_KEY, roles), ApiBearerAuth());

// Any admin (super admin or PT).
export const Admin = () => Roles(...ADMIN_ROLES);

// A trainee.
export const User = () => Roles("trainee");

// Routes a passcode-locked admin may still call (lock screen, sign-out, me).
export const AllowLocked = () => SetMetadata(ALLOW_LOCKED_KEY, true);

export type TraineeScopeMeta = {
  // Route param holding the id.
  param: string;
  // `user`: the param is a trainee id; `conversation`: a chat conversation id.
  source: "user" | "conversation";
  ignoreHidden: boolean;
};

// The route is about a trainee: a PT only reaches their own, hidden trainees
// need a reveal. `:userId` by default.
export const ScopedToTrainee = (options: Partial<TraineeScopeMeta> = {}) =>
  SetMetadata(TRAINEE_SCOPE_KEY, {
    param: "userId",
    source: "user",
    ignoreHidden: false,
    ...options,
  } satisfies TraineeScopeMeta);

// The signed-in actor of the request.
export const Actor = createParamDecorator(
  (_data, context: ExecutionContext) => {
    const actor = context.switchToHttp().getRequest<AuthedRequest>().actor;

    if (!actor) {
      throw new Error("@Actor() used on a route that has no session");
    }
    return actor;
  },
);
