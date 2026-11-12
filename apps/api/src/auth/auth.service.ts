import { Inject, Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { AUTH_MESSAGES } from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { User } from "../database/entities/user.entity.js";
import type { AuthActor } from "./actor.js";
import {
  badRequest,
  SessionInvalidError,
  SessionNotFoundError,
} from "./auth.errors.js";
import {
  CREDENTIAL_STRATEGIES,
  type CredentialInputs,
  type CredentialMethod,
  CredentialStrategies,
  type CredentialStrategy,
} from "./credential.strategy.js";
import { PasswordHasher } from "./password-hash.js";
import { hashToken } from "./session-token.js";
import { SessionQueries } from "./sessions.queries.js";
import { type ClientContext, SessionsService } from "./sessions.service.js";

// Use cases of AuthModule: login through any credential strategy, refresh,
// logout, session list and revoke, change password.
@Injectable()
export class AuthService {
  private readonly strategies: CredentialStrategies;

  constructor(
    @Inject(CREDENTIAL_STRATEGIES) strategies: CredentialStrategy[],
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly sessions: SessionsService,
    private readonly sessionQueries: SessionQueries,
    private readonly hasher: PasswordHasher,
    private readonly clock: Clock,
  ) {
    this.strategies = new CredentialStrategies(strategies);
  }

  // strategy.verify -> sessions.create. Every identity method ends here, so
  // web and mobile get the same opaque token whatever proved who they are.
  async login<M extends CredentialMethod>(
    method: M,
    input: CredentialInputs[M],
    client: ClientContext,
  ) {
    const subject = await this.strategies.get(method).verify(input);
    const { token, sessionId } = await this.sessions.create({
      subject,
      client,
    });
    const actor = await this.sessions.loadActor(sessionId);

    if (!actor) {
      throw new SessionInvalidError();
    }
    return { token, actor };
  }

  // Rotates the token of the calling session. The old token stops working.
  async refresh(actor: AuthActor, currentToken: string) {
    const token = await this.sessions.rotate(
      actor.session.id,
      hashToken(currentToken),
    );
    const fresh = token
      ? await this.sessions.loadActor(actor.session.id)
      : null;

    if (!token || !fresh) {
      throw new SessionInvalidError();
    }
    return { token, actor: fresh };
  }

  logout(actor: AuthActor) {
    return this.sessions.revoke(actor.session.id);
  }

  async listSessions(actor: AuthActor) {
    return this.sessionQueries.listActive(actor, this.clock.now());
  }

  // Only the caller's own sessions: someone else's id is the same 404 as a
  // missing one.
  async revokeSession(actor: AuthActor, sessionId: string) {
    const owned = await this.sessionQueries.findOwned(sessionId, actor);

    if (!owned) {
      throw new SessionNotFoundError();
    }
    await this.sessions.revoke(sessionId);
  }

  // Port of changePasswordAction: the current password must match, the new one
  // replaces it, every other device is signed out and this one stays.
  async changePassword(
    actor: AuthActor,
    input: { currentPassword: string; newPassword: string },
  ) {
    if (actor.kind !== "user") {
      throw new SessionInvalidError();
    }
    const repo = this.dataSource.getRepository(User);
    const user = await repo.findOne({
      where: { id: actor.id },
      select: { id: true, passwordHash: true },
    });

    // A missing hash is never a match.
    const correct = user?.passwordHash
      ? await this.hasher.verify(input.currentPassword, user.passwordHash)
      : false;

    if (!correct) {
      throw badRequest(
        "CURRENT_PASSWORD_WRONG",
        AUTH_MESSAGES.CURRENT_PASSWORD_WRONG,
      );
    }
    await repo.update(
      { id: actor.id },
      {
        passwordHash: await this.hasher.hash(input.newPassword),
        // Whole seconds, like the web.
        passwordChangedAt: new Date(
          Math.floor(this.clock.now().getTime() / 1000) * 1000,
        ),
      },
    );
    await this.sessions.revokeAll(
      { kind: "user", id: actor.id },
      actor.session.id,
    );
  }
}
