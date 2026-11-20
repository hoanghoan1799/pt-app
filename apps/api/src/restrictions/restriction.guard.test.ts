import type { ExecutionContext } from "@nestjs/common";
import { RESTRICTION_ERROR_CODES, RESTRICTION_MESSAGES } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import type { AdminActor, UserActor } from "../auth/actor.js";
import {
  assertNotRestricted,
  RestrictedWriteGuard,
} from "./restriction.guard.js";
import { RestrictedError } from "./restrictions.errors.js";

const session = {
  id: "s",
  clientKind: "web" as const,
  clientName: null,
  createdAt: new Date(0),
  lastSeenAt: new Date(0),
  expiresAt: new Date(0),
};

const trainee = (restriction: UserActor["restriction"]): UserActor => ({
  kind: "user",
  id: 2,
  role: "trainee",
  name: "An",
  email: null,
  locale: null,
  ptAdminId: 1,
  chatEnabled: true,
  termsVersion: 1,
  preferredMealCount: null,
  foodNote: null,
  restriction,
  session,
});

const RESTRICTION = {
  id: 1,
  userId: 2,
  level: "restricted" as const,
  until: null,
  reason: "spam",
  createdAt: new Date(0),
};

const http = (actor: unknown) =>
  ({
    getType: () => "http",
    switchToHttp: () => ({ getRequest: () => ({ actor }) }),
  }) as unknown as ExecutionContext;

describe("assertNotRestricted", () => {
  it("refuses a trainee with an active restriction, with the shared code and message", () => {
    let error: unknown;

    try {
      assertNotRestricted(trainee(RESTRICTION));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(RestrictedError);
    expect((error as RestrictedError).getStatus()).toBe(403);
    expect((error as RestrictedError).getResponse()).toEqual({
      code: RESTRICTION_ERROR_CODES.RESTRICTED,
      message: RESTRICTION_MESSAGES.RESTRICTED,
    });
  });

  it("lets an unrestricted trainee, an admin and no actor through", () => {
    expect(() => assertNotRestricted(trainee(null))).not.toThrow();
    expect(() =>
      assertNotRestricted({ kind: "admin", id: 1 } as AdminActor),
    ).not.toThrow();
    expect(() => assertNotRestricted(undefined)).not.toThrow();
  });
});

describe("RestrictedWriteGuard", () => {
  const guard = new RestrictedWriteGuard();

  it("applies the check to HTTP requests", () => {
    expect(() => guard.canActivate(http(trainee(RESTRICTION)))).toThrow(
      RestrictedError,
    );
    expect(guard.canActivate(http(trainee(null)))).toBe(true);
  });

  it("leaves socket events to their own check", () => {
    expect(
      guard.canActivate({ getType: () => "ws" } as unknown as ExecutionContext),
    ).toBe(true);
  });
});
