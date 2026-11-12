import { describe, expect, it } from "vitest";

import type { AdminActor } from "../actor.js";
import { PtScopePolicy } from "./pt-scope.policy.js";

// The riskiest rules in the app (a mistake is a privacy regression). Ported from
// apps/web/services/__tests__/pt-workspace-guard.test.ts, admin-scope.test.ts
// and admin-reveal.test.ts.

const admin = (overrides: Partial<AdminActor> = {}): AdminActor => ({
  kind: "admin",
  id: 1,
  role: "pt",
  username: "pt",
  verified: false,
  locale: null,
  presenceHidden: false,
  hasPasscode: true,
  unlockedUntil: new Date("2026-11-12T10:05:00Z"),
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

const own = { ptAdminId: 1, hidden: false };
const foreign = { ptAdminId: 2, hidden: false };
const unassigned = { ptAdminId: null, hidden: false };
const policy = new PtScopePolicy();

describe("workspace", () => {
  it("a PT works with their own trainees only", () => {
    expect(policy.canAccessTrainee(admin(), own)).toBe(true);
    expect(policy.canAccessTrainee(admin(), foreign)).toBe(false);
  });

  it("an unassigned trainee belongs to no PT", () => {
    expect(policy.canAccessTrainee(admin(), unassigned)).toBe(false);
  });

  it("a super admin works with every trainee", () => {
    const superAdmin = admin({ role: "super_admin", id: 9 });

    for (const trainee of [own, foreign, unassigned]) {
      expect(policy.canAccessTrainee(superAdmin, trainee)).toBe(true);
    }
  });

  it("the PT id must match exactly (no loose comparison)", () => {
    expect(
      policy.isInWorkspace(
        { id: 1, role: "pt" },
        { ptAdminId: 1, hidden: false },
      ),
    ).toBe(true);
    expect(
      policy.isInWorkspace(
        { id: 1, role: "pt" },
        { ptAdminId: 11, hidden: false },
      ),
    ).toBe(false);
    expect(
      policy.isInWorkspace(
        { id: 2, role: "pt" },
        { ptAdminId: null, hidden: false },
      ),
    ).toBe(false);
  });
});

describe("hidden trainees", () => {
  const hidden = { ptAdminId: 1, hidden: true };

  it("are out of reach without a reveal", () => {
    expect(policy.canAccessTrainee(admin(), hidden)).toBe(false);
    expect(
      policy.canAccessTrainee(admin({ role: "super_admin" }), hidden),
    ).toBe(false);
  });

  it("open up while the admin's reveal is active", () => {
    expect(policy.canAccessTrainee(admin({ revealed: true }), hidden)).toBe(
      true,
    );
  });

  it("a reveal never widens the workspace", () => {
    expect(
      policy.canAccessTrainee(admin({ revealed: true }), {
        ptAdminId: 2,
        hidden: true,
      }),
    ).toBe(false);
  });

  it("hide and unhide only need the workspace", () => {
    expect(
      policy.canAccessTrainee(admin(), hidden, { ignoreHidden: true }),
    ).toBe(true);
    expect(
      policy.canAccessTrainee(
        admin(),
        { ptAdminId: 2, hidden: true },
        { ignoreHidden: true },
      ),
    ).toBe(false);
  });

  it("a visible trainee does not need a reveal", () => {
    expect(policy.canAccessTrainee(admin({ revealed: false }), own)).toBe(true);
  });
});

describe("passcode lock", () => {
  it("gives a locked admin nothing, even with a stale reveal flag", () => {
    const locked = admin({ locked: true, revealed: true });

    expect(policy.canAccessTrainee(locked, own)).toBe(false);
    expect(
      policy.canAccessTrainee(locked, { ptAdminId: 1, hidden: true }),
    ).toBe(false);
    expect(
      policy.canAccessTrainee(
        admin({ locked: true, role: "super_admin" }),
        own,
        {
          ignoreHidden: true,
        },
      ),
    ).toBe(false);
  });
});
