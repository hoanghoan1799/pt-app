import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { AUTH_MESSAGES, PASSCODE_LENGTH } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AdminActor } from "../auth/actor.js";
import {
  badRequest,
  conflict,
  LoginLockedError,
  PasscodeNotSetError,
  PasscodeSignedOutError,
  SessionInvalidError,
} from "../auth/auth.errors.js";
import {
  LoginLimiter,
  passcodeResetLimiterKey,
  passcodeRevealLimiterKey,
} from "../auth/login-limiter.service.js";
import { PasswordHasher } from "../auth/password-hash.js";
import { SessionsService } from "../auth/sessions.service.js";
import { AdminPasscodeStrategy } from "../auth/strategies/admin-passcode.strategy.js";
import { Admin } from "../database/entities/admin.entity.js";
import { AdminHiddenUser } from "../database/entities/admin-hidden-user.entity.js";

const PASSCODE_SHAPE = new RegExp(`^\\d{${PASSCODE_LENGTH}}$`);

// Use cases of the admin passcode lock, ported from passcode-actions.ts and
// revealHiddenUsersAction. The lock lives on the session (unlocked_until,
// revealed_until), not in a cookie. Every method returns the refreshed actor so
// the controller can map the new lock state.
@Injectable()
export class AdminPasscodeService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly strategy: AdminPasscodeStrategy,
    private readonly sessions: SessionsService,
    private readonly limiter: LoginLimiter,
    private readonly hasher: PasswordHasher,
  ) {}

  private get admins() {
    return this.dataSource.getRepository(Admin);
  }

  // First passcode. Needs an unlocked session; with one already set the admin
  // must use `change`.
  async set(actor: AdminActor, passcode: string) {
    if (actor.hasPasscode) {
      throw conflict(
        "PASSCODE_ALREADY_SET",
        AUTH_MESSAGES.PASSCODE_ALREADY_SET,
      );
    }
    await this.storeHash(actor.id, passcode);
    // The admin just typed it: do not lock them out right away.
    await this.sessions.unlock(actor.session.id, { keepReveal: true });
    return this.refreshed(actor);
  }

  async change(actor: AdminActor, current: string, next: string) {
    if (current === next) {
      throw badRequest("PASSCODE_SAME", AUTH_MESSAGES.PASSCODE_SAME);
    }
    await this.verifyCurrent(actor, current);
    await this.storeHash(actor.id, next);
    await this.sessions.unlock(actor.session.id, { keepReveal: true });
    return this.refreshed(actor);
  }

  // Refused while trainees are hidden: they would become visible to anyone
  // with the open app (KAN-160, Q14).
  async remove(actor: AdminActor, current: string) {
    await this.verifyCurrent(actor, current);

    const hidden = await this.dataSource
      .getRepository(AdminHiddenUser)
      .count({ where: { adminId: actor.id } });

    if (hidden > 0) {
      throw conflict(
        "PASSCODE_HAS_HIDDEN_CHATS",
        AUTH_MESSAGES.PASSCODE_HAS_HIDDEN_CHATS,
      );
    }
    await this.admins.update(
      { id: actor.id },
      { passcodeHash: null, passcodeFailedCount: 0 },
    );
    await this.sessions.lock(actor.session.id);
    return this.refreshed(actor);
  }

  // The lock screen. Coming back from a lock starts without revealed trainees.
  async verify(actor: AdminActor, passcode: string) {
    await this.verifyCurrent(actor, passcode);
    await this.sessions.unlock(actor.session.id);
    return this.refreshed(actor);
  }

  // "Forgot passcode": the account password proves it is the admin, then a new
  // passcode replaces the old one. Wrong passwords have their own limiter.
  async reset(actor: AdminActor, password: string, newPasscode: string) {
    const limiterKey = passcodeResetLimiterKey(actor.id);

    if (await this.limiter.isLocked(limiterKey)) {
      throw new LoginLockedError();
    }
    const admin = await this.admins.findOne({
      where: { id: actor.id },
      select: { id: true, passwordHash: true },
    });

    if (!admin || !(await this.hasher.verify(password, admin.passwordHash))) {
      await this.limiter.recordFailure(limiterKey);
      throw badRequest(
        "PASSCODE_RESET_PASSWORD_WRONG",
        AUTH_MESSAGES.PASSCODE_RESET_PASSWORD_WRONG,
      );
    }
    await this.limiter.clear(limiterKey);
    await this.storeHash(actor.id, newPasscode);
    await this.sessions.unlock(actor.session.id, { keepReveal: true });
    return this.refreshed(actor);
  }

  // "Lock now": ends the unlock and the reveal at once. Without a passcode
  // there is nothing to lock with.
  async lock(actor: AdminActor) {
    if (!actor.hasPasscode) {
      throw new PasscodeNotSetError();
    }
    await this.sessions.lock(actor.session.id);
    return this.refreshed(actor);
  }

  // The right passcode starts a 10 minute reveal of hidden trainees. Every
  // other outcome (malformed, wrong, no passcode, rate limited) is the same
  // quiet `null`, and a wrong code only counts on its own limiter key: it never
  // signs the admin out.
  async reveal(actor: AdminActor, passcode: string) {
    if (!PASSCODE_SHAPE.test(passcode)) {
      return null;
    }
    const limiterKey = passcodeRevealLimiterKey(actor.id);

    if (await this.limiter.isLocked(limiterKey)) {
      return null;
    }
    const admin = await this.admins.findOne({
      where: { id: actor.id },
      select: { id: true, passcodeHash: true },
    });

    if (
      !admin?.passcodeHash ||
      !(await this.hasher.verify(passcode, admin.passcodeHash))
    ) {
      await this.limiter.recordFailure(limiterKey);
      return null;
    }
    await this.limiter.clear(limiterKey);
    return this.sessions.reveal(actor.session.id);
  }

  // A wrong passcode counts toward the 5-strike sign-out wherever it is typed;
  // the 5th also ends this session.
  private async verifyCurrent(actor: AdminActor, passcode: string) {
    try {
      await this.strategy.verify({ adminId: actor.id, passcode });
    } catch (error) {
      if (error instanceof PasscodeSignedOutError) {
        await this.sessions.revoke(actor.session.id);
      }
      throw error;
    }
  }

  private async storeHash(adminId: number, passcode: string) {
    await this.admins.update(
      { id: adminId },
      {
        passcodeHash: await this.hasher.hash(passcode),
        passcodeFailedCount: 0,
      },
    );
  }

  private async refreshed(actor: AdminActor) {
    const fresh = await this.sessions.loadActor(actor.session.id);

    if (fresh?.kind !== "admin") {
      throw new SessionInvalidError();
    }
    return fresh;
  }
}
