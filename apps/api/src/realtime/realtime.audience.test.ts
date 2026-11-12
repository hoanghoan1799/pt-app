import { describe, expect, it } from "vitest";

import type { AdminActor, UserActor } from "../auth/actor.js";
import { PtScopePolicy } from "../auth/policies/pt-scope.policy.js";
import { ChatPolicy, type ConversationFacts } from "../chat/chat.policy.js";
import type { ChatQueries } from "../chat/chat.queries.js";
import { RealtimeAudience } from "./realtime.audience.js";
import { isOriginAllowed } from "./realtime.auth.js";

// Who may follow a conversation on a socket: the ChatPolicy rules, applied to
// live sockets. A mistake here leaks a hidden or foreign conversation.

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
  chatEnabled: false,
  termsVersion: null,
  preferredMealCount: null,
  foodNote: null,
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
  hasPasscode: false,
  unlockedUntil: null,
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

const audienceWith = (stored: ConversationFacts | null) =>
  new RealtimeAudience(
    new ChatPolicy(new PtScopePolicy()),
    {
      findTraineeFacts: () => Promise.resolve(stored),
    } as unknown as ChatQueries,
    {} as never,
    {} as never,
  );

const audience = audienceWith(null);

describe("who may follow a conversation", () => {
  it("lets a trainee follow only their own", () => {
    expect(audience.mayFollow(trainee(10), facts())).toBe(true);
    expect(audience.mayFollow(trainee(11), facts())).toBe(false);
  });

  it("lets a trainee follow their own conversation while chat is locked (reads stay open)", () => {
    expect(audience.mayFollow(trainee(10), facts({ chatEnabled: false }))).toBe(
      true,
    );
  });

  it("lets a PT follow only their own trainees", () => {
    expect(audience.mayFollow(admin({ id: 1 }), facts({ ptAdminId: 1 }))).toBe(
      true,
    );
    expect(audience.mayFollow(admin({ id: 2 }), facts({ ptAdminId: 1 }))).toBe(
      false,
    );
    expect(
      audience.mayFollow(admin({ id: 1 }), facts({ ptAdminId: null })),
    ).toBe(false);
  });

  it("lets a super admin follow every conversation", () => {
    const boss = admin({ id: 9, role: "super_admin" });

    expect(audience.mayFollow(boss, facts({ ptAdminId: 1 }))).toBe(true);
    expect(audience.mayFollow(boss, facts({ ptAdminId: null }))).toBe(true);
  });

  it("keeps a hidden conversation away until the session revealed it", () => {
    const hidden = facts({ hidden: true });

    expect(audience.mayFollow(admin(), hidden)).toBe(false);
    expect(audience.mayFollow(admin({ revealed: true }), hidden)).toBe(true);
  });

  it("keeps everything away from a passcode-locked admin, revealed or not", () => {
    expect(audience.mayFollow(admin({ locked: true }), facts())).toBe(false);
    expect(
      audience.mayFollow(
        admin({ locked: true, revealed: true }),
        facts({ hidden: true }),
      ),
    ).toBe(false);
  });

  it("follows nothing for a trainee that does not exist", () => {
    expect(audience.mayFollow(admin(), null)).toBe(false);
  });

  it("looks the trainee up for an admin and decides on the stored facts", async () => {
    expect(
      await audienceWith(facts({ hidden: true })).mayFollowTrainee(admin(), 10),
    ).toBe(false);
    expect(await audienceWith(facts()).mayFollowTrainee(admin(), 10)).toBe(
      true,
    );
    expect(await audienceWith(null).mayFollowTrainee(admin(), 10)).toBe(false);
  });

  it("decides a trainee by id alone", async () => {
    expect(await audienceWith(null).mayFollowTrainee(trainee(10), 10)).toBe(
      true,
    );
    expect(await audienceWith(null).mayFollowTrainee(trainee(10), 11)).toBe(
      false,
    );
  });
});

describe("handshake origin", () => {
  const web = "http://localhost:3000";

  it("accepts the web origin, with or without a trailing slash", () => {
    expect(isOriginAllowed("http://localhost:3000", web)).toBe(true);
    expect(isOriginAllowed("http://localhost:3000/", web)).toBe(true);
  });

  it("accepts a client that sends no origin (mobile, server)", () => {
    expect(isOriginAllowed(undefined, web)).toBe(true);
  });

  it("refuses any other browser origin", () => {
    expect(isOriginAllowed("https://evil.example", web)).toBe(false);
    expect(isOriginAllowed("http://localhost:3001", web)).toBe(false);
    expect(isOriginAllowed("null", web)).toBe(false);
  });
});
