import type { DataSource } from "typeorm";
import { describe, expect, it, vi } from "vitest";

import {
  PasscodeNotSetError,
  PasscodeSignedOutError,
  PasscodeWrongError,
} from "../auth.errors.js";
import { hashPassword, PasswordHasher } from "../password-hash.js";
import { AdminPasscodeStrategy } from "./admin-passcode.strategy.js";

// Fake DataSource that keeps the failure counter in memory.
const build = async (passcode: string | null) => {
  const state = {
    hash: passcode ? await hashPassword(passcode) : null,
    failed: 0,
  };
  const update = vi.fn(
    async (_where: unknown, values: { passcodeFailedCount?: number }) => {
      if (values.passcodeFailedCount !== undefined) {
        state.failed = values.passcodeFailedCount;
      }
    },
  );
  const dataSource = {
    getRepository: () => ({
      findOne: async () => ({ id: 5, passcodeHash: state.hash }),
      update,
    }),
    createQueryBuilder: () => {
      const builder = {
        update: () => builder,
        set: () => builder,
        where: () => builder,
        returning: () => builder,
        execute: async () => {
          state.failed += 1;
          return { raw: [{ passcode_failed_count: state.failed }] };
        },
      };

      return builder;
    },
  } as unknown as DataSource;

  return {
    strategy: new AdminPasscodeStrategy(dataSource, new PasswordHasher()),
    state,
  };
};

describe("AdminPasscodeStrategy", () => {
  it("returns the admin and resets the counter on the right passcode", async () => {
    const { strategy, state } = await build("1234");

    await expect(
      strategy.verify({ adminId: 5, passcode: "0000" }),
    ).rejects.toBeInstanceOf(PasscodeWrongError);
    expect(state.failed).toBe(1);
    expect(await strategy.verify({ adminId: 5, passcode: "1234" })).toEqual({
      kind: "admin",
      id: 5,
    });
    expect(state.failed).toBe(0);
  });

  it("counts attempts down from 4 and signs out on the 5th, resetting the counter", async () => {
    const { strategy, state } = await build("1234");
    const left: unknown[] = [];

    for (let i = 0; i < 4; i++) {
      await strategy
        .verify({ adminId: 5, passcode: "0000" })
        .catch((error: PasscodeWrongError) => {
          left.push(
            (error.getResponse() as { details: { attemptsLeft: number } })
              .details.attemptsLeft,
          );
        });
    }
    expect(left).toEqual([4, 3, 2, 1]);
    await expect(
      strategy.verify({ adminId: 5, passcode: "0000" }),
    ).rejects.toBeInstanceOf(PasscodeSignedOutError);
    expect(state.failed).toBe(0);
  });

  it("is a 400 without a passcode and never reaches the counter", async () => {
    const { strategy, state } = await build(null);

    await expect(
      strategy.verify({ adminId: 5, passcode: "1234" }),
    ).rejects.toBeInstanceOf(PasscodeNotSetError);
    expect(state.failed).toBe(0);
  });

  it("identifies itself as the admin_passcode method", async () => {
    expect((await build("1234")).strategy.method).toBe("admin_passcode");
  });
});
