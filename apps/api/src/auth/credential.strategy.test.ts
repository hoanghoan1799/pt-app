import type { Mocked } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { AuthService } from "./auth.service.js";
import {
  CredentialStrategies,
  type CredentialStrategy,
} from "./credential.strategy.js";

// A new login method is one more strategy in the list: nothing else changes.
const fake = (method: string, subject = { kind: "user" as const, id: 1 }) =>
  ({
    method,
    verify: vi.fn(async () => subject),
  }) as unknown as Mocked<CredentialStrategy>;

describe("CredentialStrategies", () => {
  it("picks the strategy by method", () => {
    const password = fake("password");
    const passcode = fake("admin_passcode");
    const registry = new CredentialStrategies([password, passcode]);

    expect(registry.get("password")).toBe(password);
    expect(registry.get("admin_passcode")).toBe(passcode);
  });

  it("fails loudly for a method nobody registered", () => {
    expect(() =>
      new CredentialStrategies([fake("password")]).get("admin_passcode"),
    ).toThrow(/admin_passcode/);
  });
});

describe("AuthService.login", () => {
  const sessions = {
    create: vi.fn(async () => ({ token: "tok", sessionId: "sid" })),
    loadActor: vi.fn(async () => ({ kind: "user", id: 9 })),
  };
  const build = (strategies: CredentialStrategy[]) =>
    new AuthService(
      strategies,
      {} as never,
      sessions as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it("ends every method in sessions.create, including one added later", async () => {
    const google = fake("google", { kind: "user", id: 9 });
    const password = fake("password", { kind: "user", id: 9 });
    const service = build([password, google]);
    const client = { clientKind: "ios" as const };

    // `google` is not a known method yet: the cast stands in for the module
    // augmentation a real GoogleStrategy would add.
    const result = await service.login(
      "google" as "password",
      {} as never,
      client,
    );

    expect(google.verify).toHaveBeenCalledTimes(1);
    expect(password.verify).not.toHaveBeenCalled();
    expect(sessions.create).toHaveBeenCalledWith({
      subject: { kind: "user", id: 9 },
      client,
    });
    expect(result.token).toBe("tok");
  });

  it("creates no session when the strategy rejects", async () => {
    sessions.create.mockClear();
    const bad = fake("password");

    bad.verify.mockRejectedValueOnce(new Error("nope"));
    await expect(
      build([bad]).login("password", {} as never, { clientKind: "web" }),
    ).rejects.toThrow("nope");
    expect(sessions.create).not.toHaveBeenCalled();
  });
});
