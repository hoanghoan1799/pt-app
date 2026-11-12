import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import { Clock } from "../../common/clock.js";
import { Admin } from "../../database/entities/admin.entity.js";
import { User } from "../../database/entities/user.entity.js";
import { InvalidCredentialsError, LoginLockedError } from "../auth.errors.js";
import type { LoginLimiter } from "../login-limiter.service.js";
import { hashPassword, PasswordHasher } from "../password-hash.js";
import {
  LOGIN_FAILURE_DELAY_MS,
  PasswordStrategy,
} from "./password.strategy.js";

// The strategy with fakes: no database, no network. The lockout rules live in
// login-limiter-rules.test.ts and the e2e tests.
const build = async (options: {
  user?: { id: number; passwordHash: string | null };
  admin?: { id: number; passwordHash: string };
  locked?: boolean;
}) => {
  const findUser = vi.fn(async () => options.user ?? null);
  const findAdmin = vi.fn(async () => options.admin ?? null);
  const dataSource = {
    getRepository: (entity: unknown) => ({
      findOne:
        entity === User ? findUser : entity === Admin ? findAdmin : vi.fn(),
    }),
  } as unknown as DataSource;
  const limiter = {
    isLocked: vi.fn(async () => options.locked ?? false),
    recordFailure: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  };
  const clock = { sleep: vi.fn(async () => undefined) } as unknown as Clock;
  const strategy = new PasswordStrategy(
    dataSource,
    new PasswordHasher(),
    limiter as unknown as LoginLimiter,
    clock,
  );

  return { strategy, limiter, clock, findUser, findAdmin };
};

describe("PasswordStrategy for trainees (by email)", () => {
  it("returns the user and clears the failures on the right password", async () => {
    const hash = await hashPassword("right-password");
    const { strategy, limiter, findUser } = await build({
      user: { id: 7, passwordHash: hash },
    });
    const subject = await strategy.verify({
      subject: "user",
      email: "  An@Example.com ",
      password: "right-password",
    });

    expect(subject).toEqual({ kind: "user", id: 7 });
    expect(limiter.isLocked).toHaveBeenCalledWith("user:an@example.com");
    expect(limiter.clear).toHaveBeenCalledWith("user:an@example.com");
    expect(findUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { emailKey: "an@example.com" } }),
    );
  });

  it("records a failure and waits on a wrong password", async () => {
    const { strategy, limiter, clock } = await build({
      user: { id: 7, passwordHash: await hashPassword("right-password") },
    });

    await expect(
      strategy.verify({
        subject: "user",
        email: "an@example.com",
        password: "nope",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(limiter.recordFailure).toHaveBeenCalledWith("user:an@example.com");
    expect(limiter.clear).not.toHaveBeenCalled();
    expect(clock.sleep).toHaveBeenCalledWith(LOGIN_FAILURE_DELAY_MS);
  });

  it("does not look the user up at all for a malformed email, but still counts it", async () => {
    const { strategy, limiter, findUser } = await build({});

    await expect(
      strategy.verify({
        subject: "user",
        email: "not-an-email",
        password: "x",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(findUser).not.toHaveBeenCalled();
    expect(limiter.recordFailure).toHaveBeenCalled();
  });

  it("rejects a trainee without a password, even with an empty-looking guess", async () => {
    const { strategy } = await build({ user: { id: 1, passwordHash: null } });

    await expect(
      strategy.verify({
        subject: "user",
        email: "an@example.com",
        password: "x",
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it("stops at the lock before any hashing or lookup", async () => {
    const { strategy, findUser, limiter } = await build({ locked: true });

    await expect(
      strategy.verify({
        subject: "user",
        email: "an@example.com",
        password: "x",
      }),
    ).rejects.toBeInstanceOf(LoginLockedError);
    expect(findUser).not.toHaveBeenCalled();
    expect(limiter.recordFailure).not.toHaveBeenCalled();
  });
});

describe("PasswordStrategy for admins (by username)", () => {
  it("returns the admin for the right password, key lower-cased", async () => {
    const { strategy, limiter, findAdmin } = await build({
      admin: { id: 3, passwordHash: await hashPassword("admin-pass-1") },
    });

    expect(
      await strategy.verify({
        subject: "admin",
        username: " Coach.Lan ",
        password: "admin-pass-1",
      }),
    ).toEqual({ kind: "admin", id: 3 });
    expect(limiter.isLocked).toHaveBeenCalledWith("admin:coach.lan");
    expect(findAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usernameKey: "coach.lan" } }),
    );
  });

  it("fails the same way for an unknown username and a wrong password", async () => {
    const unknown = await build({});
    const wrong = await build({
      admin: { id: 3, passwordHash: await hashPassword("admin-pass-1") },
    });

    for (const { strategy, limiter } of [unknown, wrong]) {
      await expect(
        strategy.verify({
          subject: "admin",
          username: "coach",
          password: "nope",
        }),
      ).rejects.toMatchObject({
        response: { code: "INVALID_CREDENTIALS" },
      });
      expect(limiter.recordFailure).toHaveBeenCalledWith("admin:coach");
    }
  });

  it("is locked by its own key", async () => {
    const { strategy } = await build({ locked: true });

    await expect(
      strategy.verify({ subject: "admin", username: "coach", password: "x" }),
    ).rejects.toBeInstanceOf(LoginLockedError);
  });
});
