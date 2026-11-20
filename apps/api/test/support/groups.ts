import type { INestApplication } from "@nestjs/common";
import type { DataSource } from "typeorm";

import { PUSH_SENDERS } from "../../src/push/push-sender.js";
import { createTestApp } from "./app.js";
import { seedAdmin, seedUser, tokenOf } from "./auth.js";
import { callWith, enableChat, newKey, upload } from "./chat.js";
import { createTestDatabase, type TestDatabase } from "./database.js";
import { FakeWebSender } from "./push.js";

// Group chat e2e: one app and database per test file, real clock (the super
// admin unread baseline compares with admins.created_at from SQL now()), a
// fake web push sender and helpers for every group route.

export type GroupWorld = {
  db: TestDatabase;
  app: INestApplication;
  ds: DataSource;
  sender: FakeWebSender;
};

export const createGroupWorld = async (): Promise<GroupWorld> => {
  const db = await createTestDatabase();
  const sender = new FakeWebSender();
  const app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [{ token: PUSH_SENDERS, value: [sender] }],
    env: { VAPID_PUBLIC_KEY: "public-key-for-tests" },
  });

  return { db, app, ds: db.dataSource, sender };
};

export const destroyGroupWorld = async (w: GroupWorld) => {
  await w.app.close();
  await w.db.drop();
};

export type Person = {
  id: number;
  key: string;
  token: string;
  name: string;
};

export const traineeIn = async (
  w: GroupWorld,
  options: { ptAdminId?: number | null; chat?: boolean; name?: string } = {},
): Promise<Person> => {
  const row = await seedUser(w.ds, {
    ptAdminId: options.ptAdminId ?? null,
    ...(options.name ? { name: options.name } : {}),
  });

  if (options.chat !== false) {
    await enableChat(w.ds, row.id);
  }
  return {
    id: row.id,
    key: `user:${row.id}`,
    name: row.name,
    token: await tokenOf(w.app, { kind: "user", ...row }),
  };
};

// Trainees that never sign in (no password hash, no session): for the cap.
export const bareTrainees = async (w: GroupWorld, count: number) =>
  Promise.all(
    Array.from({ length: count }, async () => {
      const row = await seedUser(w.ds, { password: null });

      return { id: row.id, key: `user:${row.id}` };
    }),
  );

export const adminIn = async (
  w: GroupWorld,
  role: "super_admin" | "pt" = "pt",
): Promise<Person> => {
  const row = await seedAdmin(w.ds, { role });

  return {
    id: row.id,
    key: `admin:${row.id}`,
    name: row.username,
    token: await tokenOf(w.app, { kind: "admin", ...row }),
  };
};

export const restrict = (w: GroupWorld, userId: number) =>
  w.ds.query(
    `INSERT INTO user_restrictions (user_id, level, until, reason, created_by_admin_id, created_at)
     VALUES ($1, 'restricted', NULL, 'spam', NULL, now())`,
    [userId],
  );

export const groupsApi = (w: GroupWorld) => {
  const call = (
    method: "get" | "post" | "put" | "patch" | "delete",
    path: string,
    token: string | null,
    options: { body?: object; headers?: Record<string, string> } = {},
  ) => callWith(w.app, method, `/v1/chat/groups${path}`, token, options);

  return {
    call,
    list: (token: string) => call("get", "", token),
    unread: (token: string) => call("get", "/unread", token),
    candidates: (token: string, groupId?: number) =>
      call(
        "get",
        groupId === undefined
          ? "/candidates"
          : `/candidates?groupId=${groupId}`,
        token,
      ),
    create: (
      token: string,
      body: { name: unknown; userIds?: unknown[]; ptIds?: unknown[] },
    ) => call("post", "", token, { body }),
    // Creates and returns the id (asserting it worked).
    createId: async (
      token: string,
      body: { name?: string; userIds?: unknown[]; ptIds?: unknown[] } = {},
    ) => {
      const response = await call("post", "", token, {
        body: { name: "Morning crew", ...body },
      });

      if (response.status !== 201) {
        throw new Error(
          `create failed: ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.groupId as number;
    },
    info: (token: string, groupId: number) => call("get", `/${groupId}`, token),
    dissolve: (token: string, groupId: number) =>
      call("delete", `/${groupId}`, token),
    add: (
      token: string,
      groupId: number,
      body: { userIds?: unknown[]; ptIds?: unknown[] },
    ) => call("post", `/${groupId}/members`, token, { body }),
    remove: (token: string, groupId: number, memberKey: string) =>
      call("delete", `/${groupId}/members/${memberKey}`, token),
    leave: (token: string, groupId: number) =>
      call("post", `/${groupId}/leave`, token),
    rename: (token: string, groupId: number, name: unknown) =>
      call("put", `/${groupId}/name`, token, { body: { name } }),
    managersOnly: (token: string, groupId: number, enabled: boolean) =>
      call("put", `/${groupId}/managers-only`, token, { body: { enabled } }),
    mute: (token: string, groupId: number, muted: boolean) =>
      call("put", `/${groupId}/mute`, token, { body: { muted } }),
    setAvatar: (token: string, groupId: number, dataUrl: string) =>
      call("put", `/${groupId}/avatar`, token, { body: { dataUrl } }),
    clearAvatar: (token: string, groupId: number) =>
      call("delete", `/${groupId}/avatar`, token),
    thread: (token: string, groupId: number, query = "") =>
      call("get", `/${groupId}/messages${query}`, token),
    send: (
      token: string,
      groupId: number,
      body: object,
      key: string = newKey(),
    ) =>
      call("post", `/${groupId}/messages`, token, {
        body,
        headers: { "Idempotency-Key": key },
      }),
    // Sends and returns the message id (asserting it worked).
    sendId: async (token: string, groupId: number, body: object = {}) => {
      const response = await call("post", `/${groupId}/messages`, token, {
        body: { body: "hello", ...body },
        headers: { "Idempotency-Key": newKey() },
      });

      if (response.status !== 201) {
        throw new Error(
          `send failed: ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
      return response.body.message.id as number;
    },
    edit: (token: string, groupId: number, mid: number, body: string) =>
      call("patch", `/${groupId}/messages/${mid}`, token, { body: { body } }),
    unsend: (token: string, groupId: number, mid: number) =>
      call("delete", `/${groupId}/messages/${mid}`, token),
    react: (token: string, groupId: number, mid: number, emoji: string) =>
      call("put", `/${groupId}/messages/${mid}/reaction`, token, {
        body: { emoji },
      }),
    unreact: (token: string, groupId: number, mid: number) =>
      call("delete", `/${groupId}/messages/${mid}/reaction`, token),
    hide: (token: string, groupId: number, mid: number, hidden: boolean) =>
      call("put", `/${groupId}/messages/${mid}/hidden`, token, {
        body: { hidden },
      }),
    edits: (token: string, groupId: number, mid: number) =>
      call("get", `/${groupId}/messages/${mid}/edits`, token),
    seen: (token: string, groupId: number, mid: number) =>
      call("get", `/${groupId}/messages/${mid}/seen`, token),
    resolve: (token: string, groupId: number, mid: number, choice: string) =>
      call("post", `/${groupId}/messages/${mid}/alert`, token, {
        body: { choice },
      }),
    read: (token: string, groupId: number, lastReadMessageId: number) =>
      call("post", `/${groupId}/read`, token, { body: { lastReadMessageId } }),
    upload: (token: string, groupId: number, bytes: Buffer) =>
      upload(w.app, `/v1/chat/groups/${groupId}/photos`, token, bytes),
    photo: (token: string, groupId: number, photoId: number) =>
      call("get", `/${groupId}/photos/${photoId}`, token),
  };
};

export const memberRow = async (
  w: GroupWorld,
  groupId: number,
  memberKey: string,
) =>
  (
    (await w.ds.query(
      `SELECT left_at, removed_by_key, muted_at, last_read_message_id, added_by_key, joined_at
       FROM chat_group_members WHERE group_id = $1 AND member_key = $2`,
      [groupId, memberKey],
    )) as {
      left_at: Date | null;
      removed_by_key: string | null;
      muted_at: Date | null;
      last_read_message_id: number | null;
      added_by_key: string;
      joined_at: Date;
    }[]
  )[0] ?? null;

export const systemLines = async (w: GroupWorld, groupId: number) =>
  (
    (await w.ds.query(
      `SELECT id, system_event, audience FROM chat_group_messages
       WHERE group_id = $1 AND kind = 'system' ORDER BY id`,
      [groupId],
    )) as { id: number; system_event: string; audience: string | null }[]
  ).map((row) => ({
    id: row.id,
    audience: row.audience,
    event: JSON.parse(row.system_event) as Record<string, unknown>,
  }));
