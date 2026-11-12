import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type { PushKind, PushSubscribeRequest } from "@pt/contracts";
import { DataSource } from "typeorm";

import type { StoredPushSubscription } from "./push-sender.js";

export type PushSubscriptionRow = StoredPushSubscription & {
  userAgent: string;
  createdAt: Date;
  lastSuccessAt: Date | null;
};

const COLUMNS = `id, owner_key AS "ownerKey", kind, endpoint, p256dh, auth,
  user_agent AS "userAgent", created_at AS "createdAt",
  last_success_at AS "lastSuccessAt"`;

// The `push_subscriptions` table. Owners are `user:<id>` / `admin:<id>`.
@Injectable()
export class PushSubscriptionStore {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // A browser re-subscribing, or another account on the same device, reuses
  // the endpoint: the row just changes owner.
  async save(ownerKey: string, input: PushSubscribeRequest, userAgent: string) {
    await this.dataSource.query(
      `INSERT INTO push_subscriptions (owner_key, endpoint, p256dh, auth, kind, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (endpoint) DO UPDATE
         SET owner_key = EXCLUDED.owner_key, p256dh = EXCLUDED.p256dh,
             auth = EXCLUDED.auth, kind = EXCLUDED.kind,
             user_agent = EXCLUDED.user_agent`,
      [
        ownerKey,
        input.endpoint,
        input.keys.p256dh,
        input.keys.auth,
        input.kind,
        userAgent.slice(0, 255),
      ],
    );
  }

  // Scoped to the owner: nobody removes another account's subscription by
  // guessing its endpoint.
  async remove(ownerKey: string, endpoint: string) {
    await this.dataSource.query(
      `DELETE FROM push_subscriptions WHERE owner_key = $1 AND endpoint = $2`,
      [ownerKey, endpoint],
    );
  }

  listFor(ownerKey: string): Promise<PushSubscriptionRow[]> {
    return this.dataSource.query(
      `SELECT ${COLUMNS} FROM push_subscriptions WHERE owner_key = $1 ORDER BY id`,
      [ownerKey],
    );
  }

  async delete(id: number) {
    await this.dataSource.query(
      `DELETE FROM push_subscriptions WHERE id = $1`,
      [id],
    );
  }

  async markSuccess(id: number, at: Date) {
    await this.dataSource.query(
      `UPDATE push_subscriptions SET last_success_at = $2 WHERE id = $1`,
      [id, at],
    );
  }

  async count(ownerKey: string) {
    const rows: { count: number }[] = await this.dataSource.query(
      `SELECT count(*)::int AS count FROM push_subscriptions WHERE owner_key = $1`,
      [ownerKey],
    );

    return rows[0]?.count ?? 0;
  }
}

export type { PushKind };
