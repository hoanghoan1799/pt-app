import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { attemptsLeft, shouldSignOut } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Admin } from "../../database/entities/admin.entity.js";
import {
  PasscodeNotSetError,
  PasscodeSignedOutError,
  PasscodeWrongError,
} from "../auth.errors.js";
import type {
  CredentialInputs,
  CredentialStrategy,
} from "../credential.strategy.js";
import { PasswordHasher } from "../password-hash.js";
import type { SubjectRef } from "../sessions.queries.js";

// Second factor for an admin that is already signed in. It has its own failure
// counter (admins.passcode_failed_count): a wrong passcode counts wherever it is
// typed (lock screen, change, turn off), and the 5th resets the counter and
// throws PasscodeSignedOutError, which the caller turns into a session revoke.
// It proves the admin again rather than creating a session, so unlike the
// identity strategies it ends in `sessions.unlock`, not `sessions.create`.
@Injectable()
export class AdminPasscodeStrategy implements CredentialStrategy<"admin_passcode"> {
  readonly method = "admin_passcode" as const;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly hasher: PasswordHasher,
  ) {}

  async verify(input: CredentialInputs["admin_passcode"]): Promise<SubjectRef> {
    const repo = this.dataSource.getRepository(Admin);
    const admin = await repo.findOne({
      where: { id: input.adminId },
      select: { id: true, passcodeHash: true },
    });

    if (!admin?.passcodeHash) {
      throw new PasscodeNotSetError();
    }
    if (!(await this.hasher.verify(input.passcode, admin.passcodeHash))) {
      const failedCount = await this.recordFailure(admin.id);

      if (shouldSignOut(failedCount)) {
        await repo.update({ id: admin.id }, { passcodeFailedCount: 0 });
        throw new PasscodeSignedOutError();
      }
      throw new PasscodeWrongError(attemptsLeft(failedCount));
    }

    await repo.update({ id: admin.id }, { passcodeFailedCount: 0 });
    return { kind: "admin", id: admin.id };
  }

  // Atomic increment, so two parallel wrong guesses both count.
  private async recordFailure(adminId: number) {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(Admin)
      .set({
        passcodeFailedCount: () => "coalesce(passcode_failed_count, 0) + 1",
      })
      .where("id = :adminId", { adminId })
      .returning("passcode_failed_count")
      .execute();
    const row = result.raw[0] as { passcode_failed_count: number } | undefined;

    return Number(row?.passcode_failed_count ?? 0);
  }
}
