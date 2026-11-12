import {
  authTokenResponseSchema,
  meResponseSchema,
  passcodeStatusResponseSchema,
  sessionListResponseSchema,
} from "@pt/contracts";
import { describe, expect, it } from "vitest";

import type { AdminActor, SessionInfo, UserActor } from "./actor.js";
import {
  toAuthTokenResponse,
  toMeResponse,
  toPasscodeStatusResponse,
  toSessionListResponse,
} from "./mappers.js";

const session: SessionInfo = {
  id: "2f2c1c8e-6a4d-4b0e-9d54-0a8a3e7a1111",
  clientKind: "ios",
  clientName: "An's iPhone",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  lastSeenAt: new Date("2026-11-12T00:00:00Z"),
  expiresAt: new Date("2027-12-12T00:00:00Z"),
};

const user: UserActor = {
  kind: "user",
  id: 4,
  role: "trainee",
  name: "An",
  email: "an@example.com",
  locale: "vi",
  ptAdminId: 2,
  session,
};

const admin: AdminActor = {
  kind: "admin",
  id: 2,
  role: "pt",
  username: "coach",
  verified: true,
  locale: null,
  presenceHidden: false,
  hasPasscode: true,
  unlockedUntil: new Date("2026-11-12T00:05:00Z"),
  revealedUntil: new Date("2026-11-12T00:10:00Z"),
  locked: false,
  revealed: true,
  session,
};

// Fields an entity has that no response may ever carry.
const SECRETS = /hash|scrypt|userAgent|"ip"|failedCount|tokenHash/i;

describe("toMeResponse", () => {
  it("maps a trainee to the contract", () => {
    const body = toMeResponse(user);

    expect(meResponseSchema.parse(body)).toEqual(body);
    expect(body).toMatchObject({
      role: "trainee",
      actor: { kind: "user", ptAdminId: 2 },
      session: { current: true, expiresAt: "2027-12-12T00:00:00.000Z" },
    });
  });

  it("maps an admin to the contract with the lock state", () => {
    const body = toMeResponse(admin);

    expect(meResponseSchema.parse(body)).toEqual(body);
    expect(body.actor).toMatchObject({
      role: "pt",
      hasPasscode: true,
      locked: false,
      unlockedUntil: "2026-11-12T00:05:00.000Z",
      revealedUntil: "2026-11-12T00:10:00.000Z",
    });
  });

  it("shows no reveal that is not active (or that a lock overrides)", () => {
    const expired = toMeResponse({ ...admin, revealed: false });
    const locked = toMeResponse({ ...admin, locked: true, revealed: false });

    expect(expired.actor).toMatchObject({ revealedUntil: null });
    expect(locked.actor).toMatchObject({ revealedUntil: null });
  });

  it("carries no secret field, even when the actor object has extras", () => {
    const dirty = {
      ...admin,
      passwordHash: "scrypt$16384$a$b",
      passcodeHash: "scrypt$16384$c$d",
      passcodeFailedCount: 3,
    } as AdminActor;

    expect(JSON.stringify(toMeResponse(dirty))).not.toMatch(SECRETS);
    expect(JSON.stringify(toMeResponse(user))).not.toMatch(SECRETS);
  });
});

describe("toAuthTokenResponse", () => {
  it("adds the token and nothing else", () => {
    const body = toAuthTokenResponse("tok", user);

    expect(authTokenResponseSchema.parse(body)).toEqual(body);
    expect(Object.keys(body).sort()).toEqual([
      "actor",
      "role",
      "session",
      "token",
    ]);
  });
});

describe("toSessionListResponse", () => {
  it("flags the current session and exposes no diagnostics", () => {
    const other = { ...session, id: "3f2c1c8e-6a4d-4b0e-9d54-0a8a3e7a2222" };
    const body = toSessionListResponse([session, other], session.id);

    expect(sessionListResponseSchema.parse(body)).toEqual(body);
    expect(body.sessions.map((s) => s.current)).toEqual([true, false]);
    expect(
      JSON.stringify(
        toSessionListResponse(
          [
            {
              ...session,
              userAgent: "UA",
              ip: "1.2.3.4",
              tokenHash: "x",
            } as SessionInfo,
          ],
          session.id,
        ),
      ),
    ).not.toMatch(SECRETS);
  });
});

describe("toPasscodeStatusResponse", () => {
  it("has exactly the four lock fields", () => {
    const body = toPasscodeStatusResponse(admin);

    expect(passcodeStatusResponseSchema.parse(body)).toEqual(body);
    expect(Object.keys(body).sort()).toEqual([
      "hasPasscode",
      "locked",
      "revealedUntil",
      "unlockedUntil",
    ]);
  });
});
