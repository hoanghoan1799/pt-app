import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, MoreThan } from "typeorm";

import { Admin } from "../database/entities/admin.entity.js";
import { Session } from "../database/entities/session.entity.js";
import { User } from "../database/entities/user.entity.js";
import type { AdminSubjectRow, SessionState, UserSubjectRow } from "./actor.js";
import type { SubjectKind } from "./session-rules.js";

export type SubjectRef = { kind: SubjectKind; id: number };

export type LoadedSession = {
  state: SessionState;
  subject:
    | { kind: "user"; row: UserSubjectRow }
    | { kind: "admin"; row: AdminSubjectRow };
};

const toState = (session: Session): SessionState => ({
  id: session.id,
  subjectKind: session.subjectKind,
  clientKind: session.clientKind,
  clientName: session.clientName,
  createdAt: session.createdAt,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  unlockedUntil: session.unlockedUntil,
  revealedUntil: session.revealedUntil,
});

// Read models for sessions. Selects only what the actor needs: no password or
// passcode hash, no photos.
@Injectable()
export class SessionQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  findByTokenHash(tokenHash: Buffer) {
    return this.load({ tokenHash });
  }

  findById(id: string) {
    return this.load({ id });
  }

  private async load(
    where: { tokenHash: Buffer } | { id: string },
  ): Promise<LoadedSession | null> {
    const session = await this.dataSource
      .getRepository(Session)
      .findOne({ where });

    if (!session) {
      return null;
    }
    if (session.subjectKind === "user" && session.userId !== null) {
      const row = await this.findUserRow(session.userId);

      return row
        ? { state: toState(session), subject: { kind: "user", row } }
        : null;
    }
    if (session.adminId !== null) {
      const row = await this.findAdminRow(session.adminId);

      return row
        ? { state: toState(session), subject: { kind: "admin", row } }
        : null;
    }
    return null;
  }

  findUserRow(id: number): Promise<UserSubjectRow | null> {
    return this.dataSource.getRepository(User).findOne({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        ptAdminId: true,
      },
    });
  }

  async findAdminRow(id: number): Promise<AdminSubjectRow | null> {
    const admin = await this.dataSource.getRepository(Admin).findOne({
      where: { id },
      select: {
        id: true,
        username: true,
        role: true,
        verifiedAt: true,
        locale: true,
        presenceHidden: true,
        // Only whether a passcode exists is derived below; the hash is read
        // into this local and dropped.
        passcodeHash: true,
      },
    });

    if (!admin) {
      return null;
    }
    const { passcodeHash, ...rest } = admin;

    return {
      id: rest.id,
      username: rest.username,
      role: rest.role,
      verifiedAt: rest.verifiedAt,
      locale: rest.locale,
      presenceHidden: rest.presenceHidden,
      hasPasscode: passcodeHash !== null,
    };
  }

  async listActive(subject: SubjectRef, now: Date) {
    const sessions = await this.dataSource.getRepository(Session).find({
      where: {
        ...(subject.kind === "user"
          ? { userId: subject.id }
          : { adminId: subject.id }),
        expiresAt: MoreThan(now),
      },
      order: { lastSeenAt: "DESC" },
    });

    return sessions.map(toState);
  }

  // The session of this subject with that public id, if it is theirs.
  async findOwned(id: string, subject: SubjectRef) {
    const session = await this.dataSource.getRepository(Session).findOne({
      where: {
        id,
        ...(subject.kind === "user"
          ? { userId: subject.id }
          : { adminId: subject.id }),
      },
    });

    return session ? toState(session) : null;
  }
}
