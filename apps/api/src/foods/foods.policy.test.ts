import { describe, expect, it } from "vitest";

import type { AdminActor, AuthActor, UserActor } from "../auth/actor.js";
import { RoleForbiddenError } from "../auth/auth.errors.js";
import { FoodsPolicy } from "./foods.policy.js";

const session = {
  id: "s",
  clientKind: "web" as const,
  clientName: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(),
};

const admin = (role: AdminActor["role"]): AdminActor => ({
  kind: "admin",
  id: 1,
  role,
  username: "a",
  verified: false,
  locale: null,
  presenceHidden: false,
  hasPasscode: false,
  unlockedUntil: null,
  revealedUntil: null,
  locked: false,
  revealed: false,
  session,
});

const trainee: UserActor = {
  kind: "user",
  id: 2,
  role: "trainee",
  name: "An",
  email: null,
  locale: null,
  ptAdminId: 1,
  session,
};

const policy = new FoodsPolicy();

describe("FoodsPolicy", () => {
  it("lets only a super admin manage the library", () => {
    expect(policy.canManage(admin("super_admin"))).toBe(true);
    expect(policy.canManage(admin("pt"))).toBe(false);
    expect(policy.canManage(trainee)).toBe(false);
  });

  it("assertCanManage throws FORBIDDEN for everyone else", () => {
    for (const actor of [admin("pt"), trainee] as AuthActor[]) {
      expect(() => policy.assertCanManage(actor)).toThrow(RoleForbiddenError);
    }
    expect(() => policy.assertCanManage(admin("super_admin"))).not.toThrow();
  });
});
