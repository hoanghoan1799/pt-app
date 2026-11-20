import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import {
  type Locale,
  toLocale,
} from "../social/notifications/notification-content.js";

export const userOwnerKey = (id: number) => `user:${id}`;
export const adminOwnerKey = (id: number) => `admin:${id}`;

export type AdminRecipient = { adminId: number; locale: Locale };

// Who hears what, from the database: the admins that may be told about a
// trainee, languages, names, private nicknames (outside chat) and a
// conversation's shared nicknames. Raw SQL on purpose: the push
// side depends on tables, not on the chat or social services.
@Injectable()
export class PushRecipients {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // A trainee wrote: every super admin and the trainee's own PT (P1), except
  // an admin who hid this trainee (KAN-163). A hidden conversation gets no push
  // at all, so no preview text can leak to a lock screen.
  async adminsForTrainee(traineeUserId: number): Promise<AdminRecipient[]> {
    const rows: { id: number; locale: string | null }[] =
      await this.dataSource.query(
        `SELECT a.id, a.locale FROM admins a
         WHERE (a.role <> 'pt'
                OR a.id = (SELECT pt_admin_id FROM users WHERE id = $1))
           AND NOT EXISTS (SELECT 1 FROM admin_hidden_users h
                           WHERE h.admin_id = a.id AND h.user_id = $1)
         ORDER BY a.id`,
        [traineeUserId],
      );

    return rows.map((row) => ({
      adminId: row.id,
      locale: toLocale(row.locale),
    }));
  }

  // Every super admin (a new report goes to all of them, hidden trainees or
  // not: the push never names a person).
  async superAdmins(): Promise<AdminRecipient[]> {
    const rows: { id: number; locale: string | null }[] =
      await this.dataSource.query(
        `SELECT id, locale FROM admins WHERE role = 'super_admin' ORDER BY id`,
      );

    return rows.map((row) => ({
      adminId: row.id,
      locale: toLocale(row.locale),
    }));
  }

  // One admin, with the same scope and hidden rules (reaction push).
  async adminForTrainee(
    adminId: number,
    traineeUserId: number,
  ): Promise<AdminRecipient | null> {
    const all = await this.adminsForTrainee(traineeUserId);

    return all.find((admin) => admin.adminId === adminId) ?? null;
  }

  async localeOf(ownerKey: string): Promise<Locale> {
    const [kind, id] = ownerKey.split(":");
    const table =
      kind === "admin" ? "admins" : kind === "user" ? "users" : null;

    if (!table || !/^\d+$/.test(id ?? "")) {
      return toLocale(null);
    }
    const rows: { locale: string | null }[] = await this.dataSource.query(
      `SELECT locale FROM ${table} WHERE id = $1`,
      [Number(id)],
    );

    return toLocale(rows[0]?.locale);
  }

  async traineeName(userId: number): Promise<string | null> {
    const rows: { name: string }[] = await this.dataSource.query(
      `SELECT name FROM users WHERE id = $1`,
      [userId],
    );

    return rows[0]?.name ?? null;
  }

  async adminName(adminId: number): Promise<string | null> {
    const rows: { name: string }[] = await this.dataSource.query(
      `SELECT username AS name FROM admins WHERE id = $1`,
      [adminId],
    );

    return rows[0]?.name ?? null;
  }

  // The real name behind an account key (`user:1` / `admin:2`), if it exists.
  async nameOf(accountKey: string): Promise<string | null> {
    const [kind, id] = accountKey.split(":");

    if (!/^\d+$/.test(id ?? "")) {
      return null;
    }
    return kind === "admin"
      ? this.adminName(Number(id))
      : kind === "user"
        ? this.traineeName(Number(id))
        : null;
  }

  // The shared nicknames of one conversation by "user" | "pt" | "admin:<id>"
  // (blank ones left out). Chat pushes name people with these, never with a
  // private alias.
  async chatNicknames(conversationId: number): Promise<Record<string, string>> {
    const rows: { target_key: string; nickname: string }[] =
      await this.dataSource.query(
        `SELECT target_key, nickname FROM chat_nicknames WHERE conversation_id = $1`,
        [conversationId],
      );

    return Object.fromEntries(
      rows
        .filter((row) => row.nickname.trim() !== "")
        .map((row) => [row.target_key, row.nickname]),
    );
  }

  // The first non-blank private nickname the owner gave to any of these keys,
  // in the order given. Used outside chat (social pushes).
  async aliasFor(
    ownerKey: string,
    targetKeys: readonly string[],
  ): Promise<string | null> {
    if (targetKeys.length === 0) {
      return null;
    }
    const rows: { target_key: string; alias: string }[] =
      await this.dataSource.query(
        `SELECT target_key, alias FROM contact_aliases
         WHERE owner_key = $1 AND target_key = ANY($2::text[])`,
        [ownerKey, [...targetKeys]],
      );
    const byKey = new Map(
      rows.map((row) => [row.target_key, row.alias.trim()]),
    );

    for (const key of targetKeys) {
      const alias = byKey.get(key);

      if (alias) {
        return alias;
      }
    }
    return null;
  }

  // A group message (company group-push.ts listGroupPushRecipients): every
  // active explicit member and every super admin (implicit), minus the sender
  // and anyone who muted the group, with their language. A member who left or
  // was removed has no active row, so hears nothing. Group membership is
  // explicit, so the PT scope and hidden trainees do not apply (spec G11).
  // Only owners with a device are returned, each with their private nickname
  // for the sender (blank = none), in one query.
  async groupRecipients(
    groupId: number,
    senderKey: string,
  ): Promise<{ ownerKey: string; locale: Locale; alias: string | null }[]> {
    const rows: {
      owner_key: string;
      locale: string | null;
      alias: string | null;
    }[] = await this.dataSource.query(
      `WITH keys AS (
           SELECT member_key AS k FROM chat_group_members
           WHERE group_id = $1 AND left_at IS NULL
           UNION
           SELECT 'admin:' || id FROM admins WHERE role = 'super_admin')
         SELECT keys.k AS owner_key, COALESCE(u.locale, a.locale) AS locale,
                NULLIF(btrim(ca.alias), '') AS alias
         FROM keys
         LEFT JOIN contact_aliases ca ON ca.owner_key = keys.k AND ca.target_key = $2
         LEFT JOIN users u ON keys.k = 'user:' || u.id
         LEFT JOIN admins a ON keys.k = 'admin:' || a.id
         WHERE keys.k <> $2
           AND (u.id IS NOT NULL OR a.id IS NOT NULL)
           AND EXISTS (SELECT 1 FROM push_subscriptions ps WHERE ps.owner_key = keys.k)
           AND NOT EXISTS (SELECT 1 FROM chat_group_members cm
                           WHERE cm.group_id = $1 AND cm.member_key = keys.k
                             AND cm.muted_at IS NOT NULL)
         ORDER BY keys.k`,
      [groupId, senderKey],
    );

    return rows.map((row) => ({
      ownerKey: row.owner_key,
      locale: toLocale(row.locale),
      alias: row.alias,
    }));
  }

  // The name of a group that is not dissolved; null otherwise.
  async liveGroupName(groupId: number): Promise<string | null> {
    const rows: { name: string }[] = await this.dataSource.query(
      `SELECT name FROM chat_groups WHERE id = $1 AND dissolved_at IS NULL`,
      [groupId],
    );

    return rows[0]?.name ?? null;
  }

  // Reaction pushes: at most one per post and recipient per interval.
  async lastReactionPushAt(
    recipientKey: string,
    postId: number,
  ): Promise<Date | null> {
    const rows: { at: Date | null }[] = await this.dataSource.query(
      `SELECT max(pushed_at) AS at FROM social_notifications
       WHERE recipient_key = $1 AND post_id = $2 AND kind = 'post_reaction'
         AND pushed_at IS NOT NULL`,
      [recipientKey, postId],
    );

    return rows[0]?.at ?? null;
  }

  async markPushed(notificationId: number, at: Date) {
    await this.dataSource.query(
      `UPDATE social_notifications SET pushed_at = $2 WHERE id = $1`,
      [notificationId, at],
    );
  }

  // The caption of a live post; null once it is deleted.
  async livePostCaption(
    postId: number,
  ): Promise<{ caption: string | null } | null> {
    const rows: { caption: string | null }[] = await this.dataSource.query(
      `SELECT caption FROM social_posts WHERE id = $1 AND deleted_at IS NULL`,
      [postId],
    );

    return rows[0] ?? null;
  }
}
