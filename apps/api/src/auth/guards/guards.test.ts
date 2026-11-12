import type { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import type { AdminActor, AuthActor, UserActor } from "../actor.js";
import {
  ALLOW_LOCKED_KEY,
  type AuthedRequest,
  IS_PUBLIC_KEY,
  ROLES_KEY,
  TRAINEE_SCOPE_KEY,
} from "../decorators/index.js";
import { PtScopePolicy } from "../policies/pt-scope.policy.js";
import type { SessionsService } from "../sessions.service.js";
import type { TraineeScopeQueries } from "../trainee-scope.queries.js";
import { PtScopeGuard } from "./pt-scope.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { SessionGuard } from "./session.guard.js";

const session = {
  id: "s",
  clientKind: "web" as const,
  clientName: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(),
};

const admin = (overrides: Partial<AdminActor> = {}): AdminActor => ({
  kind: "admin",
  id: 1,
  role: "pt",
  username: "pt",
  verified: false,
  locale: null,
  presenceHidden: false,
  hasPasscode: false,
  unlockedUntil: null,
  revealedUntil: null,
  locked: false,
  revealed: false,
  session,
  ...overrides,
});

const trainee: UserActor = {
  kind: "user",
  id: 2,
  role: "trainee",
  name: "An",
  email: null,
  locale: null,
  ptAdminId: 1,
  chatEnabled: false,
  termsVersion: null,
  preferredMealCount: null,
  foodNote: null,
  session,
};

// Metadata is looked up by key on the handler, like the real Reflector does.
const contextOf = (
  request: Partial<AuthedRequest>,
  metadata: Record<string, unknown> = {},
  type = "http",
) => {
  const handler = () => undefined;
  const controller = class {};

  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => controller,
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
};

const asRequest = (actor?: AuthActor, params: Record<string, string> = {}) =>
  ({ actor, params, headers: {} }) as unknown as AuthedRequest;

// Socket.IO events are authenticated by the handshake, not by these HTTP guards.
describe("the HTTP guards on a socket event", () => {
  const socket = () => contextOf({}, { [ROLES_KEY]: ["pt"] }, "ws");

  it("let it through without a session", async () => {
    const authenticate = vi.fn();
    const session = new SessionGuard(new Reflector(), {
      authenticate,
    } as unknown as SessionsService);
    const roles = new RolesGuard(new Reflector());
    const scope = new PtScopeGuard(
      new Reflector(),
      new PtScopePolicy(),
      {} as unknown as TraineeScopeQueries,
    );

    expect(await session.canActivate(socket())).toBe(true);
    expect(roles.canActivate(socket())).toBe(true);
    expect(await scope.canActivate(socket())).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });
});

describe("SessionGuard", () => {
  const build = (actor: AuthActor | null) => {
    const authenticate = vi.fn(async () => actor);

    return {
      guard: new SessionGuard(new Reflector(), {
        authenticate,
      } as unknown as SessionsService),
      authenticate,
    };
  };
  const withHeader = (authorization?: string) =>
    ({ headers: { authorization }, params: {} }) as unknown as AuthedRequest;

  it("lets public routes through without looking at the token", async () => {
    const { guard, authenticate } = build(null);

    expect(
      await guard.canActivate(
        contextOf(withHeader(), { [IS_PUBLIC_KEY]: true }),
      ),
    ).toBe(true);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("attaches the actor for a valid Bearer token", async () => {
    const { guard, authenticate } = build(trainee);
    const request = withHeader(`Bearer ${"a".repeat(43)}`);

    expect(await guard.canActivate(contextOf(request))).toBe(true);
    expect(authenticate).toHaveBeenCalledWith("a".repeat(43));
    expect(request.actor).toBe(trainee);
  });

  it("answers 401 for no header, a bad shape or an unknown session", async () => {
    await expect(
      build(null).guard.canActivate(contextOf(withHeader())),
    ).rejects.toMatchObject({
      response: { code: "SESSION_INVALID" },
    });
    const bad = build(trainee);

    await expect(
      bad.guard.canActivate(contextOf(withHeader("Bearer x"))),
    ).rejects.toThrow();
    expect(bad.authenticate).not.toHaveBeenCalled();
    await expect(
      build(null).guard.canActivate(
        contextOf(withHeader(`Bearer ${"a".repeat(43)}`)),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("RolesGuard", () => {
  const guard = new RolesGuard(new Reflector());
  const run = (
    actor: AuthActor | undefined,
    metadata: Record<string, unknown> = {},
  ) => guard.canActivate(contextOf(asRequest(actor), metadata));

  it("allows any signed-in actor when no roles are listed", () => {
    expect(run(trainee)).toBe(true);
    expect(run(admin())).toBe(true);
  });

  it("matches super_admin, pt and trainee against the list", () => {
    const only = (...roles: string[]) => ({ [ROLES_KEY]: roles });

    expect(run(admin({ role: "super_admin" }), only("super_admin"))).toBe(true);
    expect(() => run(admin({ role: "pt" }), only("super_admin"))).toThrow();
    expect(run(admin({ role: "pt" }), only("super_admin", "pt"))).toBe(true);
    expect(run(trainee, only("trainee"))).toBe(true);
    expect(() => run(trainee, only("super_admin", "pt"))).toThrow();
    expect(() => run(admin(), only("trainee"))).toThrow();
  });

  it("ignores public routes and refuses a request without an actor", () => {
    expect(run(undefined, { [IS_PUBLIC_KEY]: true })).toBe(true);
    expect(() => run(undefined)).toThrow();
  });

  it("blocks a locked admin unless the route is lock-exempt", () => {
    const locked = admin({ locked: true, hasPasscode: true });

    expect(() => run(locked, { [ROLES_KEY]: ["pt"] })).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({ code: "ADMIN_LOCKED" }),
      }),
    );
    expect(run(locked, { [ROLES_KEY]: ["pt"], [ALLOW_LOCKED_KEY]: true })).toBe(
      true,
    );
    // A trainee is never "locked".
    expect(run(trainee, { [ROLES_KEY]: ["trainee"] })).toBe(true);
  });
});

describe("PtScopeGuard", () => {
  const meta = (overrides = {}) => ({
    [TRAINEE_SCOPE_KEY]: {
      param: "userId",
      source: "user",
      ignoreHidden: false,
      ...overrides,
    },
  });
  const build = (
    facts: { userId: number; ptAdminId: number | null; hidden: boolean } | null,
  ) => {
    const queries = {
      findByUserId: vi.fn(async () => facts),
      findByConversationId: vi.fn(async () => facts),
    };

    return {
      queries,
      guard: new PtScopeGuard(
        new Reflector(),
        new PtScopePolicy(),
        queries as unknown as TraineeScopeQueries,
      ),
    };
  };

  it("ignores routes that are not about a trainee", async () => {
    const { guard, queries } = build(null);

    expect(await guard.canActivate(contextOf(asRequest(trainee)))).toBe(true);
    expect(queries.findByUserId).not.toHaveBeenCalled();
  });

  it("only admins can be scoped", async () => {
    const { guard } = build({ userId: 2, ptAdminId: 1, hidden: false });

    await expect(
      guard.canActivate(contextOf(asRequest(trainee, { userId: "2" }), meta())),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows an own trainee and records which one", async () => {
    const { guard, queries } = build({
      userId: 2,
      ptAdminId: 1,
      hidden: false,
    });
    const request = asRequest(admin(), { userId: "2" });

    expect(await guard.canActivate(contextOf(request, meta()))).toBe(true);
    expect(queries.findByUserId).toHaveBeenCalledWith(1, 2);
    expect(request.scopedUserId).toBe(2);
  });

  it("answers 404 for another PT's trainee, a hidden one and a missing one", async () => {
    for (const facts of [
      { userId: 2, ptAdminId: 9, hidden: false },
      { userId: 2, ptAdminId: 1, hidden: true },
      null,
    ]) {
      const { guard } = build(facts);

      await expect(
        guard.canActivate(
          contextOf(asRequest(admin(), { userId: "2" }), meta()),
        ),
      ).rejects.toMatchObject({
        status: 404,
        response: { code: "TRAINEE_NOT_FOUND" },
      });
    }
  });

  it("opens a hidden trainee for a revealing admin, or on hide routes", async () => {
    const { guard } = build({ userId: 2, ptAdminId: 1, hidden: true });

    expect(
      await guard.canActivate(
        contextOf(
          asRequest(admin({ revealed: true }), { userId: "2" }),
          meta(),
        ),
      ),
    ).toBe(true);
    expect(
      await guard.canActivate(
        contextOf(
          asRequest(admin(), { userId: "2" }),
          meta({ ignoreHidden: true }),
        ),
      ),
    ).toBe(true);
  });

  it("rejects non-numeric ids before touching the database", async () => {
    const { guard, queries } = build({
      userId: 1,
      ptAdminId: 1,
      hidden: false,
    });

    for (const bad of ["abc", "-3", "0", "2.5", "1e3", "", "9999999999999"]) {
      await expect(
        guard.canActivate(
          contextOf(asRequest(admin(), { userId: bad }), meta()),
        ),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(queries.findByUserId).not.toHaveBeenCalled();
  });

  it("resolves a conversation id through its owner", async () => {
    const { guard, queries } = build({
      userId: 5,
      ptAdminId: 1,
      hidden: false,
    });
    const request = asRequest(admin(), { cid: "40" });

    await guard.canActivate(
      contextOf(request, meta({ param: "cid", source: "conversation" })),
    );
    expect(queries.findByConversationId).toHaveBeenCalledWith(1, 40);
    expect(request.scopedUserId).toBe(5);
  });
});
