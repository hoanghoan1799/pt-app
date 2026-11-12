import { describe, expect, it } from "vitest";

import type { AdminActor, UserActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { ChatPolicy, type ConversationFacts } from "./chat.policy.js";

// Who may read and write which conversation. Ported from chat-permission.ts,
// admin-scope.ts, hidden-users.ts and the web's route tests ("a trainee they
// hid", "until they reveal"). A mistake here is a privacy regression.

const session = {
  id: "00000000-0000-4000-8000-000000000000",
  clientKind: "web" as const,
  clientName: null,
  createdAt: new Date(),
  lastSeenAt: new Date(),
  expiresAt: new Date(),
};

const trainee = (id: number): UserActor => ({
  kind: "user",
  id,
  role: "trainee",
  name: "Trainee",
  email: null,
  locale: null,
  ptAdminId: null,
  session,
});

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
  session,
  ...overrides,
});

const facts = (
  overrides: Partial<ConversationFacts> = {},
): ConversationFacts => ({
  traineeId: 10,
  ptAdminId: 1,
  hidden: false,
  chatEnabled: true,
  ...overrides,
});

const policy = new ChatPolicy(new PtScopePolicy());

describe("trainee", () => {
  it("reads and writes their own conversation", () => {
    expect(policy.canRead(trainee(10), facts())).toBe(true);
    expect(policy.canWrite(trainee(10), facts())).toBe(true);
  });

  it("never reaches another trainee's conversation", () => {
    expect(policy.canRead(trainee(11), facts())).toBe(false);
    expect(policy.canWrite(trainee(11), facts())).toBe(false);
  });

  it("keeps reading but cannot write while chat is locked (D5)", () => {
    const locked = facts({ chatEnabled: false });

    expect(policy.canRead(trainee(10), locked)).toBe(true);
    expect(policy.canWrite(trainee(10), locked)).toBe(false);
  });

  it("is not helped by a PT assignment or a hidden flag", () => {
    expect(policy.canRead(trainee(10), facts({ ptAdminId: null }))).toBe(true);
    expect(policy.canRead(trainee(10), facts({ hidden: true }))).toBe(true);
  });
});

describe("PT", () => {
  it("reads and writes the conversations of own trainees", () => {
    expect(policy.canRead(admin(), facts())).toBe(true);
    expect(policy.canWrite(admin(), facts())).toBe(true);
  });

  it("never reaches another PT's trainee or an unassigned one", () => {
    expect(policy.canRead(admin(), facts({ ptAdminId: 2 }))).toBe(false);
    expect(policy.canRead(admin(), facts({ ptAdminId: null }))).toBe(false);
    expect(policy.canWrite(admin(), facts({ ptAdminId: 2 }))).toBe(false);
  });

  it("cannot write to a locked trainee (D6) but still reads", () => {
    const locked = facts({ chatEnabled: false });

    expect(policy.canRead(admin(), locked)).toBe(true);
    expect(policy.canWrite(admin(), locked)).toBe(false);
  });
});

describe("super admin", () => {
  const boss = admin({ role: "super_admin", id: 9 });

  it("reads and writes every conversation", () => {
    expect(policy.canRead(boss, facts({ ptAdminId: 2 }))).toBe(true);
    expect(policy.canRead(boss, facts({ ptAdminId: null }))).toBe(true);
    expect(policy.canWrite(boss, facts({ ptAdminId: 2 }))).toBe(true);
  });

  it("cannot write to a locked trainee", () => {
    expect(policy.canWrite(boss, facts({ chatEnabled: false }))).toBe(false);
  });
});

describe("hidden conversations", () => {
  const hidden = facts({ hidden: true });

  it("are invisible to the admin who hid them until the session revealed", () => {
    expect(policy.canRead(admin(), hidden)).toBe(false);
    expect(policy.canWrite(admin(), hidden)).toBe(false);
    expect(policy.canRead(admin({ revealed: true }), hidden)).toBe(true);
    expect(policy.canWrite(admin({ revealed: true }), hidden)).toBe(true);
  });

  it("apply to a super admin who hid the trainee too", () => {
    const boss = admin({ role: "super_admin", id: 9 });

    expect(policy.canRead(boss, hidden)).toBe(false);
    expect(policy.canRead({ ...boss, revealed: true }, hidden)).toBe(true);
  });

  it("do not widen the workspace: a revealed PT still needs the trainee to be theirs", () => {
    expect(
      policy.canRead(
        admin({ revealed: true }),
        facts({ hidden: true, ptAdminId: 2 }),
      ),
    ).toBe(false);
  });
});

describe("passcode-locked admin", () => {
  it("reads and writes nothing, even revealed or super", () => {
    const locked = admin({ locked: true, revealed: true });
    const boss = admin({ role: "super_admin", id: 9, locked: true });

    expect(policy.canRead(locked, facts())).toBe(false);
    expect(policy.canWrite(locked, facts())).toBe(false);
    expect(policy.canRead(boss, facts({ ptAdminId: 2 }))).toBe(false);
  });
});
