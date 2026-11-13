import { describe, expect, it } from "vitest";

import type { AdminActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { WorkoutsPolicy } from "./workouts.policy.js";

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
  session: {
    id: "00000000-0000-4000-8000-000000000000",
    clientKind: "web",
    clientName: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(),
  },
  ...overrides,
});

const policy = new WorkoutsPolicy(new PtScopePolicy());

describe("isDue", () => {
  it("allows today and past days, not tomorrow (Q7)", () => {
    expect(policy.isDue("2026-11-12", "2026-11-12")).toBe(true);
    expect(policy.isDue("2026-11-01", "2026-11-12")).toBe(true);
    expect(policy.isDue("2026-11-13", "2026-11-12")).toBe(false);
  });
});

describe("isSameWeekCopy", () => {
  const base = {
    userId: 1,
    targetUserId: 1,
    sourceWeek: "2026-11-09",
    targetWeek: "2026-11-09",
  };

  it("is true only for the same trainee and the same week", () => {
    expect(policy.isSameWeekCopy(base)).toBe(true);
    expect(policy.isSameWeekCopy({ ...base, targetUserId: 2 })).toBe(false);
    expect(policy.isSameWeekCopy({ ...base, targetWeek: "2026-11-16" })).toBe(
      false,
    );
  });
});

describe("canCopyInto", () => {
  it("lets a PT copy into their own trainee only", () => {
    expect(policy.canCopyInto(admin(), { ptAdminId: 1, hidden: false })).toBe(
      true,
    );
    expect(policy.canCopyInto(admin(), { ptAdminId: 2, hidden: false })).toBe(
      false,
    );
    expect(
      policy.canCopyInto(admin(), { ptAdminId: null, hidden: false }),
    ).toBe(false);
  });

  it("lets a super admin copy into anyone", () => {
    expect(
      policy.canCopyInto(admin({ role: "super_admin" }), {
        ptAdminId: 9,
        hidden: false,
      }),
    ).toBe(true);
  });

  it("refuses a missing trainee", () => {
    expect(policy.canCopyInto(admin(), null)).toBe(false);
  });

  it("refuses a hidden trainee until the admin revealed hidden ones", () => {
    const facts = { ptAdminId: 1, hidden: true };

    expect(policy.canCopyInto(admin(), facts)).toBe(false);
    expect(policy.canCopyInto(admin({ revealed: true }), facts)).toBe(true);
  });

  it("refuses everything for a locked admin", () => {
    expect(
      policy.canCopyInto(admin({ locked: true }), {
        ptAdminId: 1,
        hidden: false,
      }),
    ).toBe(false);
  });
});

describe("mayOverwriteDays", () => {
  it("never overwrites logged sets", () => {
    expect(policy.mayOverwriteDays(true)).toBe(false);
    expect(policy.mayOverwriteDays(false)).toBe(true);
  });
});
