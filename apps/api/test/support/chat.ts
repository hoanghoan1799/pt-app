import type { INestApplication } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import request from "supertest";
import type { DataSource } from "typeorm";

import { ChatConversation } from "../../src/database/entities/chat-conversation.entity.js";
import { User } from "../../src/database/entities/user.entity.js";

// Trainee chat is off by default: only an explicit `true` unlocks it.
export const enableChat = (ds: DataSource, userId: number, enabled = true) =>
  ds.getRepository(User).update({ id: userId }, { chatEnabled: enabled });

export const ensureConversation = async (ds: DataSource, userId: number) => {
  const repo = ds.getRepository(ChatConversation);
  const existing = await repo.findOneBy({ userId });

  return existing ? existing.id : (await repo.save({ userId })).id;
};

// A PNG whose header says width x height (the server reads only the header),
// padded to `size` bytes when asked.
export const pngBytes = (width = 2, height = 2, size = 0) => {
  const head = Buffer.alloc(33);

  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head);
  head.writeUInt32BE(13, 8);
  head.write("IHDR", 12, "ascii");
  head.writeUInt32BE(width, 16);
  head.writeUInt32BE(height, 20);
  head[24] = 8;
  head[25] = 6;
  return size > head.length
    ? Buffer.concat([head, Buffer.alloc(size - head.length, 7)])
    : head;
};

export const jpegBytes = () =>
  Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x04, 0x03,
    0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
  ]);

export const GIF_BYTES = Buffer.from("GIF89a000000000000", "ascii");

// A single UUID-looking idempotency key.
let counter = 0;
export const newKey = () =>
  `key-${Date.now().toString(36)}-${(counter += 1).toString().padStart(6, "0")}`;

export type Captured = { name: string; payload: Record<string, unknown> };

// Every domain event the app emits, in order.
export const captureEvents = (app: INestApplication) => {
  const events: Captured[] = [];

  app.get(EventEmitter2).onAny((name, payload) => {
    events.push({ name: String(name), payload: payload as never });
  });
  return {
    all: events,
    named: (name: string) => events.filter((event) => event.name === name),
    clear: () => {
      events.length = 0;
    },
  };
};

export const upload = (
  app: INestApplication,
  path: string,
  token: string,
  bytes: Buffer,
  headers: Record<string, string> = {},
  contentType = "image/png",
) =>
  request(app.getHttpServer())
    .post(path)
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", contentType)
    .set(headers)
    .send(bytes);

export const callWith = (
  app: INestApplication,
  method: "get" | "post" | "put" | "patch" | "delete",
  path: string,
  token: string | null,
  options: { body?: object; headers?: Record<string, string> } = {},
) => {
  const req = request(app.getHttpServer())[method](path);

  if (token) {
    req.set("Authorization", `Bearer ${token}`);
  }
  req.set(options.headers ?? {});
  return options.body === undefined ? req : req.send(options.body);
};
