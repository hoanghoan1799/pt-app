import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import type { DataSource } from "typeorm";

import { hashPassword } from "../../src/auth/password-hash.js";
import { Clock } from "../../src/common/clock.js";
import { Admin } from "../../src/database/entities/admin.entity.js";
import { AdminHiddenUser } from "../../src/database/entities/admin-hidden-user.entity.js";
import { ChatConversation } from "../../src/database/entities/chat-conversation.entity.js";
import { User } from "../../src/database/entities/user.entity.js";

// A clock tests can move: lockout windows and session expiry without sleeping.
export class FakeClock extends Clock {
  private current: Date;

  constructor(start = new Date("2026-11-12T10:00:00.000Z")) {
    super();
    this.current = start;
  }

  override now() {
    return new Date(this.current);
  }

  override sleep() {
    return Promise.resolve();
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

let counter = 0;
const next = () => ++counter;

export const seedAdmin = async (
  dataSource: DataSource,
  options: {
    username?: string;
    password?: string;
    role?: "super_admin" | "pt" | null;
    passcode?: string;
  } = {},
) => {
  const username = options.username ?? `admin${next()}`;
  const password = options.password ?? "admin-password-1";
  const admin = await dataSource.getRepository(Admin).save({
    username,
    usernameKey: username.toLowerCase(),
    passwordHash: await hashPassword(password),
    passcodeHash: options.passcode
      ? await hashPassword(options.passcode)
      : null,
    role: options.role === undefined ? "pt" : options.role,
  });

  return { id: admin.id, username, password };
};

export const seedUser = async (
  dataSource: DataSource,
  options: {
    name?: string;
    email?: string;
    password?: string | null;
    ptAdminId?: number | null;
  } = {},
) => {
  const n = next();
  const name = options.name ?? `Trainee ${n}`;
  const email = options.email ?? `trainee${n}@example.com`;
  const password =
    options.password === undefined ? "user-password-1" : options.password;
  const user = await dataSource.getRepository(User).save({
    name,
    nameKey: name.toLowerCase(),
    email,
    emailKey: email.toLowerCase(),
    passwordHash: password === null ? null : await hashPassword(password),
    ptAdminId: options.ptAdminId ?? null,
  });

  return { id: user.id, name, email, password: password ?? "" };
};

export const seedConversation = async (
  dataSource: DataSource,
  userId: number,
) => (await dataSource.getRepository(ChatConversation).save({ userId })).id;

export const hideTrainee = (
  dataSource: DataSource,
  adminId: number,
  userId: number,
) => dataSource.getRepository(AdminHiddenUser).save({ adminId, userId });

export const loginUser = (
  app: INestApplication,
  creds: { email: string; password: string },
  extra: Record<string, unknown> = {},
) =>
  request(app.getHttpServer())
    .post("/v1/auth/login")
    .send({ ...creds, ...extra });

export const loginAdmin = (
  app: INestApplication,
  creds: { username: string; password: string },
  extra: Record<string, unknown> = {},
) =>
  request(app.getHttpServer())
    .post("/v1/auth/admin/login")
    .send({ ...creds, ...extra });

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Signs in and returns the token (asserting the login worked).
export const tokenOf = async (
  app: INestApplication,
  who:
    | { kind: "user"; email: string; password: string }
    | { kind: "admin"; username: string; password: string },
) => {
  const response =
    who.kind === "user"
      ? await loginUser(app, who)
      : await loginAdmin(app, who);

  if (response.status !== 200) {
    throw new Error(`Login failed with ${response.status}`);
  }
  return response.body.token as string;
};
