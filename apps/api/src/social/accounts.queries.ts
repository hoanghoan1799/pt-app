import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type AdminRole,
  parseSocialActorKey,
  type SocialAuthorKind,
  toAdminRole,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import type { AuthorRef } from "./social-actor.js";

export type AccountInfo = {
  // What the viewer sees: their private nickname when set, else the real name.
  name: string;
  // Always the real name.
  realName: string;
  avatarUrl: string | null;
  verified: boolean;
};

export type ProfileRow = {
  kind: SocialAuthorKind;
  id: number;
  name: string;
  bio: string;
  avatarUrl: string | null;
  verified: boolean;
  role: "trainee" | AdminRole;
};

// TEMPORARY: a read-only view of users / admins / contact_aliases for author
// names, avatars and the verified tick. Merge: replace with the Users step's
// account directory and alias queries (the avatar URL shape moves there too).
@Injectable()
export class SocialAccountQueries {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  avatarUrl(kind: SocialAuthorKind, id: number, updatedAt: Date | null) {
    return updatedAt
      ? `/v1/avatars/${kind}/${id}?v=${Math.floor(updatedAt.getTime() / 1000)}`
      : null;
  }

  // Keys of deleted accounts are simply missing from the map. With `viewerKey`
  // the viewer's private nicknames replace the names (never their own).
  async loadAccounts(
    keys: string[],
    viewerKey?: string,
  ): Promise<Map<string, AccountInfo>> {
    const refs = [...new Set(keys)]
      .map((key) => parseSocialActorKey(key))
      .filter((ref) => ref !== null);
    const userIds = refs.filter((r) => r.kind === "user").map((r) => r.id);
    const adminIds = refs.filter((r) => r.kind === "admin").map((r) => r.id);
    const [userRows, adminRows]: [
      { id: number; name: string; avatar_updated_at: Date | null }[],
      {
        id: number;
        name: string;
        avatar_updated_at: Date | null;
        verified_at: Date | null;
      }[],
    ] = await Promise.all([
      userIds.length
        ? this.dataSource.query(
            `SELECT id, name, avatar_updated_at FROM users WHERE id = ANY($1::int[])`,
            [userIds],
          )
        : [],
      adminIds.length
        ? this.dataSource.query(
            `SELECT id, username AS name, avatar_updated_at, verified_at
             FROM admins WHERE id = ANY($1::int[])`,
            [adminIds],
          )
        : [],
    ]);
    const result = new Map<string, AccountInfo>();

    for (const row of userRows) {
      result.set(`user:${row.id}`, {
        name: row.name,
        realName: row.name,
        avatarUrl: this.avatarUrl("user", row.id, row.avatar_updated_at),
        verified: false,
      });
    }
    for (const row of adminRows) {
      result.set(`admin:${row.id}`, {
        name: row.name,
        realName: row.name,
        avatarUrl: this.avatarUrl("admin", row.id, row.avatar_updated_at),
        verified: row.verified_at !== null,
      });
    }
    if (viewerKey && result.size > 0) {
      const aliases = await this.loadAliases(viewerKey, [...result.keys()]);

      for (const [key, account] of result) {
        if (key !== viewerKey) {
          result.set(key, {
            ...account,
            name: aliases.get(key) ?? account.name,
          });
        }
      }
    }
    return result;
  }

  // The owner's non-blank aliases for these targets.
  async loadAliases(
    ownerKey: string,
    targetKeys: string[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(targetKeys)];

    if (wanted.length === 0) {
      return new Map();
    }
    const rows: { target_key: string; alias: string }[] =
      await this.dataSource.query(
        `SELECT target_key, alias FROM contact_aliases
         WHERE owner_key = $1 AND target_key = ANY($2::text[])`,
        [ownerKey, wanted],
      );

    return new Map(
      rows
        .filter((row) => row.alias.trim() !== "")
        .map((row) => [row.target_key, row.alias.trim()]),
    );
  }

  async findProfile(who: AuthorRef): Promise<ProfileRow | null> {
    if (who.kind === "user") {
      const rows: {
        name: string;
        bio: string | null;
        avatar_updated_at: Date | null;
      }[] = await this.dataSource.query(
        `SELECT name, bio, avatar_updated_at FROM users WHERE id = $1`,
        [who.id],
      );
      const row = rows[0];

      return row
        ? {
            kind: "user",
            id: who.id,
            name: row.name,
            bio: row.bio ?? "",
            avatarUrl: this.avatarUrl("user", who.id, row.avatar_updated_at),
            verified: false,
            role: "trainee",
          }
        : null;
    }
    const rows: {
      name: string;
      bio: string | null;
      avatar_updated_at: Date | null;
      verified_at: Date | null;
      role: string | null;
    }[] = await this.dataSource.query(
      `SELECT username AS name, bio, avatar_updated_at, verified_at, role
       FROM admins WHERE id = $1`,
      [who.id],
    );
    const row = rows[0];

    return row
      ? {
          kind: "admin",
          id: who.id,
          name: row.name,
          bio: row.bio ?? "",
          avatarUrl: this.avatarUrl("admin", who.id, row.avatar_updated_at),
          verified: row.verified_at !== null,
          role: toAdminRole(row.role),
        }
      : null;
  }

  async postPrivacyDefault(userId: number) {
    const rows: { post_privacy_default: string | null }[] =
      await this.dataSource.query(
        `SELECT post_privacy_default FROM users WHERE id = $1`,
        [userId],
      );

    return (rows[0]?.post_privacy_default ?? "friends") as
      | "everyone"
      | "friends"
      | "only_me";
  }

  async termsVersion(userId: number): Promise<number | null> {
    const rows: { terms_version: number | null }[] =
      await this.dataSource.query(
        `SELECT terms_version FROM users WHERE id = $1`,
        [userId],
      );

    return rows[0]?.terms_version ?? null;
  }
}
