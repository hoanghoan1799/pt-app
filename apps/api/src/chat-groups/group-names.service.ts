import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { type GroupRole, parseActorRef, toAdminRole } from "@pt/contracts";
import { DataSource } from "typeorm";

import { avatarUrl } from "../files/image-rules.js";

export type GroupIdentity = {
  // Real name (users.name / admins.username).
  name: string;
  role: GroupRole;
  avatarUrl: string | null;
};

export type ShownNames = {
  identities: Map<string, GroupIdentity>;
  // The viewer's private nickname first, else the real name; null for a
  // deleted account (the UI shows "Deleted member").
  nameOf: (key: string) => string | null;
};

// Names, roles and avatars of member keys (company group-names.ts). Keys of
// deleted accounts are absent. Private nicknames (contact_aliases) are the
// viewer's own and nobody else's (G22).
@Injectable()
export class GroupNames {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async identities(
    keys: Iterable<string>,
  ): Promise<Map<string, GroupIdentity>> {
    const refs = [...new Set(keys)].flatMap((key) => {
      const ref = parseActorRef(key);

      return ref ? [ref] : [];
    });
    const userIds = refs.filter((r) => r.kind === "user").map((r) => r.id);
    const adminIds = refs.filter((r) => r.kind === "admin").map((r) => r.id);
    const [userRows, adminRows]: [
      { id: number; name: string; avatar_updated_at: Date | null }[],
      {
        id: number;
        name: string;
        role: string | null;
        avatar_updated_at: Date | null;
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
            `SELECT id, username AS name, role, avatar_updated_at
             FROM admins WHERE id = ANY($1::int[])`,
            [adminIds],
          )
        : [],
    ]);
    const result = new Map<string, GroupIdentity>();

    for (const row of userRows) {
      result.set(`user:${row.id}`, {
        name: row.name,
        role: "trainee",
        avatarUrl: avatarUrl("user", row.id, row.avatar_updated_at),
      });
    }
    for (const row of adminRows) {
      result.set(`admin:${row.id}`, {
        name: row.name,
        role: toAdminRole(row.role),
        avatarUrl: avatarUrl("admin", row.id, row.avatar_updated_at),
      });
    }
    return result;
  }

  async shown(viewerKey: string, keys: Iterable<string>): Promise<ShownNames> {
    const wanted = [...new Set(keys)];
    const [identities, aliasRows]: [
      Map<string, GroupIdentity>,
      { target_key: string; alias: string }[],
    ] = await Promise.all([
      this.identities(wanted),
      wanted.length
        ? this.dataSource.query(
            `SELECT target_key, alias FROM contact_aliases
             WHERE owner_key = $1 AND target_key = ANY($2::text[])`,
            [viewerKey, wanted],
          )
        : [],
    ]);
    const aliases = new Map(
      aliasRows.map((row) => [row.target_key, row.alias.trim()]),
    );

    return {
      identities,
      nameOf: (key) => {
        const identity = identities.get(key);

        if (!identity) {
          return null;
        }
        return aliases.get(key) || identity.name;
      },
    };
  }
}
