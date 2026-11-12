import type { INestApplication } from "@nestjs/common";
import { STICKER_ERRORS } from "@pt/contracts";
import type { DataSource } from "typeorm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { Clock } from "../src/common/clock.js";
import { ChatCustomSticker } from "../src/database/entities/chat-custom-sticker.entity.js";
import { ChatMessage } from "../src/database/entities/chat-message.entity.js";
import { GIPHY_CLIENT } from "../src/stickers/giphy.js";
import { createTestApp } from "./support/app.js";
import { FakeClock, seedAdmin, seedUser, tokenOf } from "./support/auth.js";
import {
  callWith,
  enableChat,
  GIF_BYTES,
  jpegBytes,
  newKey,
  pngBytes,
  upload,
} from "./support/chat.js";
import { createTestDatabase, type TestDatabase } from "./support/database.js";

let db: TestDatabase;
let app: INestApplication;
let ds: DataSource;
let clock: FakeClock;

// GIPHY is always faked: the suite never touches the network.
const giphy = {
  enabled: true,
  fetchStickers: vi.fn<(query: string) => Promise<unknown>>(),
};

const giphyItem = (id: string, extra: object = {}) => ({
  id,
  title: `title ${id}`,
  images: {
    fixed_width: { url: `https://media1.giphy.com/media/${id}/200w.gif` },
    fixed_width_small: { url: `https://media1.giphy.com/media/${id}/100w.gif` },
  },
  ...extra,
});

beforeAll(async () => {
  db = await createTestDatabase();
  ds = db.dataSource;
  clock = new FakeClock();
  app = await createTestApp({
    databaseUrl: db.url,
    nodeEnv: "test",
    overrideProviders: [
      { token: Clock, value: clock },
      { token: GIPHY_CLIENT, value: giphy },
    ],
  });
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(() => {
  giphy.enabled = true;
  giphy.fetchStickers.mockReset();
  giphy.fetchStickers.mockResolvedValue({ data: [giphyItem("abc123")] });
});

const trainee = async (
  options: { ptAdminId?: number; chat?: boolean } = {},
) => {
  const row = await seedUser(ds, { ptAdminId: options.ptAdminId ?? null });

  if (options.chat !== false) {
    await enableChat(ds, row.id);
  }
  return { ...row, token: await tokenOf(app, { kind: "user", ...row }) };
};

const admin = async (role: "super_admin" | "pt" = "pt") => {
  const row = await seedAdmin(ds, { role });

  return { ...row, token: await tokenOf(app, { kind: "admin", ...row }) };
};

const add = (token: string, bytes: Buffer = pngBytes(), type = "image/png") =>
  upload(app, "/v1/chat/stickers/custom", token, bytes, {}, type);

const list = (token: string | null) =>
  callWith(app, "get", "/v1/chat/stickers/custom", token);

const image = (token: string | null, id: number | string) =>
  callWith(app, "get", `/v1/chat/stickers/custom/${id}`, token);

describe("personal stickers", () => {
  it("stores a PNG and lists it for its owner only, newest first", async () => {
    const me = await trainee();
    const other = await trainee();
    const bytes = pngBytes(64, 64, 800);
    const first = await add(me.token, bytes);
    const second = await add(me.token);

    expect(first.status).toBe(201);
    expect(first.body).toEqual({
      sticker: {
        id: expect.any(Number),
        url: `/v1/chat/stickers/custom/${first.body.sticker.id}`,
      },
    });
    const stored = await ds
      .getRepository(ChatCustomSticker)
      .findOneByOrFail({ id: first.body.sticker.id });

    expect(stored).toMatchObject({
      ownerKind: "user",
      ownerId: me.id,
      mime: "image/png",
      size: 800,
      deletedAt: null,
    });
    expect(Buffer.compare(stored.data, bytes)).toBe(0);
    expect(
      (await list(me.token)).body.stickers.map((s: { id: number }) => s.id),
    ).toEqual([second.body.sticker.id, first.body.sticker.id]);
    expect((await list(other.token)).body).toEqual({ stickers: [] });
  });

  it("takes the type from the bytes, not from the client", async () => {
    const me = await trainee();
    const webp = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.alloc(4),
      Buffer.from("WEBPVP8 ", "ascii"),
      Buffer.alloc(20),
    ]);
    const asWebp = await add(me.token, webp, "image/png");
    const stored = await ds
      .getRepository(ChatCustomSticker)
      .findOneByOrFail({ id: asWebp.body.sticker.id });

    expect(stored.mime).toBe("image/webp");
  });

  it("rejects a JPEG, a GIF and an empty body with 400", async () => {
    const me = await trainee();

    for (const bytes of [jpegBytes(), GIF_BYTES, Buffer.alloc(0)]) {
      const response = await add(me.token, bytes);

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        code: "STICKER_BAD_IMAGE",
        message: STICKER_ERRORS.BAD_IMAGE,
      });
    }
  });

  it("accepts 150 KB and rejects one byte more with 413", async () => {
    const me = await trainee();
    const limit = 150 * 1024;

    expect((await add(me.token, pngBytes(10, 10, limit))).status).toBe(201);
    const over = await add(me.token, pngBytes(10, 10, limit + 1));

    expect(over.status).toBe(413);
    expect(over.body).toMatchObject({
      code: "STICKER_TOO_LARGE",
      message: STICKER_ERRORS.TOO_LARGE,
    });
  });

  it("allows 100 per owner and rejects the 101st with 409 and the Vietnamese message", async () => {
    const me = await trainee();
    const pt = await admin();

    await ds.query(
      `INSERT INTO chat_custom_stickers (owner_kind, owner_id, mime, data, size, created_at)
       SELECT 'user', $1, 'image/png', $2, 33, now() FROM generate_series(1, 100)`,
      [me.id, pngBytes()],
    );
    const full = await add(me.token);

    expect(full.status).toBe(409);
    expect(full.body).toMatchObject({
      code: "STICKER_LIMIT",
      message: STICKER_ERRORS.LIMIT,
    });
    // The PT set is separate from the trainee set, even for the same id.
    expect((await add(pt.token)).status).toBe(201);
    expect((await list(me.token)).body.stickers).toHaveLength(100);
    expect((await list(pt.token)).body.stickers).toHaveLength(1);
    // A removed sticker frees a place.
    const first = (await list(me.token)).body.stickers[0].id;

    await callWith(
      app,
      "delete",
      `/v1/chat/stickers/custom/${first}`,
      me.token,
    );
    expect((await add(me.token)).status).toBe(201);
  });

  it("is 401 without a session and 403 for a locked chat (trainees only)", async () => {
    const locked = await trainee({ chat: false });
    const pt = await admin();
    const mine = await add((await trainee()).token);

    expect((await list(null)).status).toBe(401);
    expect((await add("")).status).toBe(401);
    for (const response of [
      await list(locked.token),
      await add(locked.token),
      await callWith(
        app,
        "delete",
        `/v1/chat/stickers/custom/${mine.body.sticker.id}`,
        locked.token,
      ),
    ]) {
      expect(response.status).toBe(403);
      expect(response.body.code).toBe("CHAT_LOCKED");
    }
    expect((await list(pt.token)).status).toBe(200);
  });

  it("serves the picture to its owner with a private immutable cache", async () => {
    const me = await trainee();
    const bytes = pngBytes(5, 5, 100);
    const made = await add(me.token, bytes);
    const response = await image(me.token, made.body.sticker.id);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("image/png");
    expect(response.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable",
    );
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.compare(response.body, bytes)).toBe(0);
    expect((await image(me.token, "abc")).status).toBe(400);
    expect((await image(me.token, 999999)).status).toBe(404);
    expect((await image(null, made.body.sticker.id)).status).toBe(401);
  });

  it("hides a never-sent sticker from other trainees and from every PT", async () => {
    const me = await trainee();
    const other = await trainee();
    const boss = await admin("super_admin");
    const made = await add(me.token);

    expect((await image(other.token, made.body.sticker.id)).status).toBe(404);
    expect((await image(boss.token, made.body.sticker.id)).status).toBe(404);
  });

  it("shows a sent sticker to the other side of that conversation only, until it is unsent", async () => {
    const pt = await admin("pt");
    const outsider = await admin("pt");
    const boss = await admin("super_admin");
    const me = await trainee({ ptAdminId: pt.id });
    const other = await trainee({ ptAdminId: pt.id });
    const made = await add(me.token);
    const id = made.body.sticker.id;
    const sent = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      {
        body: { sticker: { customId: id } },
        headers: { "Idempotency-Key": newKey() },
      },
    );

    expect(sent.status).toBe(201);
    expect((await image(pt.token, id)).status).toBe(200);
    expect((await image(boss.token, id)).status).toBe(200);
    expect((await image(outsider.token, id)).status).toBe(404);
    expect((await image(other.token, id)).status).toBe(404);
    await callWith(
      app,
      "delete",
      `/v1/chat/messages/${sent.body.message.id}`,
      me.token,
    );
    expect((await image(pt.token, id)).status).toBe(404);
    expect((await image(me.token, id)).status).toBe(200);
  });

  it("really deletes a sticker that was never sent", async () => {
    const me = await trainee();
    const made = await add(me.token);
    const id = made.body.sticker.id;
    const response = await callWith(
      app,
      "delete",
      `/v1/chat/stickers/custom/${id}`,
      me.token,
    );

    expect(response.status).toBe(204);
    expect(await ds.getRepository(ChatCustomSticker).existsBy({ id })).toBe(
      false,
    );
    expect((await list(me.token)).body.stickers).toEqual([]);
  });

  it("only hides a sticker that was already sent, so the bubbles keep their picture", async () => {
    const pt = await admin("pt");
    const me = await trainee({ ptAdminId: pt.id });
    const id = (await add(me.token)).body.sticker.id;

    await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      {
        body: { sticker: { customId: id } },
        headers: { "Idempotency-Key": newKey() },
      },
    );
    expect(
      (
        await callWith(
          app,
          "delete",
          `/v1/chat/stickers/custom/${id}`,
          me.token,
        )
      ).status,
    ).toBe(204);
    const row = await ds
      .getRepository(ChatCustomSticker)
      .findOneByOrFail({ id });

    expect(row.deletedAt).toEqual(clock.now());
    expect((await list(me.token)).body.stickers).toEqual([]);
    expect((await image(pt.token, id)).status).toBe(200);
    // A removed sticker can no longer be sent.
    const again = await callWith(
      app,
      "post",
      "/v1/chat/conversations/me/messages",
      me.token,
      {
        body: { sticker: { customId: id } },
        headers: { "Idempotency-Key": newKey() },
      },
    );

    expect(again.status).toBe(400);
    expect(
      await ds
        .getRepository(ChatMessage)
        .countBy({ stickerRef: `custom:${id}` }),
    ).toBe(1);
  });

  it("cannot delete someone else's sticker or a bad id", async () => {
    const me = await trainee();
    const other = await trainee();
    const id = (await add(me.token)).body.sticker.id;

    expect(
      (
        await callWith(
          app,
          "delete",
          `/v1/chat/stickers/custom/${id}`,
          other.token,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await callWith(
          app,
          "delete",
          "/v1/chat/stickers/custom/999999",
          me.token,
        )
      ).body,
    ).toMatchObject({
      code: "STICKER_NOT_FOUND",
      message: STICKER_ERRORS.NOT_FOUND,
    });
    expect(
      (await callWith(app, "delete", "/v1/chat/stickers/custom/0", me.token))
        .status,
    ).toBe(400);
    expect(
      (await callWith(app, "delete", `/v1/chat/stickers/custom/${id}`, null))
        .status,
    ).toBe(401);
    expect(await ds.getRepository(ChatCustomSticker).existsBy({ id })).toBe(
      true,
    );
  });
});

describe("GET /v1/chat/stickers/giphy (faked)", () => {
  const search = (token: string | null, q?: string) =>
    callWith(
      app,
      "get",
      `/v1/chat/stickers/giphy${q === undefined ? "" : `?q=${encodeURIComponent(q)}`}`,
      token,
    );

  it("answers enabled:false and never calls GIPHY when there is no key", async () => {
    const me = await trainee();

    giphy.enabled = false;
    const response = await search(me.token, "gym");

    expect(response.body).toEqual({ enabled: false, stickers: [] });
    expect(giphy.fetchStickers).not.toHaveBeenCalled();
  });

  it("is 401 signed out, 403 while chat is locked, and open to an admin", async () => {
    const locked = await trainee({ chat: false });
    const pt = await admin();

    expect((await search(null)).status).toBe(401);
    expect((await search(locked.token)).body.code).toBe("CHAT_LOCKED");
    expect((await search(pt.token)).status).toBe(200);
    expect(giphy.fetchStickers).toHaveBeenCalledTimes(1);
  });

  it("searches and returns only the picker fields, trending for an empty query", async () => {
    const me = await trainee();
    const response = await search(me.token, "  tập   gym ");

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toEqual({
      enabled: true,
      stickers: [
        {
          giphyId: "abc123",
          url: "https://media1.giphy.com/media/abc123/200w.gif",
          previewUrl: "https://media1.giphy.com/media/abc123/100w.gif",
          alt: "title abc123",
        },
      ],
    });
    expect(giphy.fetchStickers).toHaveBeenLastCalledWith("tập gym");
    // The empty query ("trending") may be cached by an earlier test.
    clock.advance(5 * 60_000 + 1);
    await search(me.token);
    expect(giphy.fetchStickers).toHaveBeenLastCalledWith("");
  });

  it("drops items whose URL is not a GIPHY media URL or whose id is odd", async () => {
    const me = await trainee();

    giphy.fetchStickers.mockResolvedValue({
      data: [
        giphyItem("good1"),
        giphyItem("evil1", {
          images: { fixed_width: { url: "https://evil.example.com/x.gif" } },
        }),
        giphyItem("no way"),
        giphyItem("ok2", { title: "   " }),
      ],
    });
    const response = await search(me.token, "mix");

    expect(
      response.body.stickers.map((s: { giphyId: string }) => s.giphyId),
    ).toEqual(["good1", "ok2"]);
    expect(response.body.stickers[1].alt).toBe("Sticker GIPHY");
  });

  it("serves a repeated query from the cache until it expires", async () => {
    const me = await trainee();

    await search(me.token, "cache me");
    await search(me.token, "Cache Me");
    expect(giphy.fetchStickers).toHaveBeenCalledTimes(1);
    clock.advance(5 * 60_000 + 1);
    await search(me.token, "cache me");
    expect(giphy.fetchStickers).toHaveBeenCalledTimes(2);
  });

  it("rejects a query over 50 characters", async () => {
    const me = await trainee();

    expect((await search(me.token, "x".repeat(51))).status).toBe(400);
    expect((await search(me.token, "x".repeat(50))).status).toBe(200);
  });

  it("answers 502 without leaking the key when GIPHY fails", async () => {
    const me = await trainee();
    const { GiphyUnavailableError } = await import("../src/stickers/giphy.js");

    giphy.fetchStickers.mockRejectedValue(
      new GiphyUnavailableError("GIPHY answered 500"),
    );
    const response = await search(me.token, "fail");

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("GIPHY_UNAVAILABLE");
    expect(JSON.stringify(response.body)).not.toContain("api_key");
    // Errors are not cached.
    giphy.fetchStickers.mockResolvedValue({ data: [giphyItem("back1")] });
    expect((await search(me.token, "fail")).body.stickers).toHaveLength(1);
  });

  it("rate limits one viewer at 30 requests a minute, not the others", async () => {
    const me = await trainee();
    const other = await trainee();

    clock.advance(61_000);
    for (let index = 0; index < 30; index += 1) {
      expect((await search(me.token, `q${index}`)).status).toBe(200);
    }
    const limited = await search(me.token, "one more");

    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("RATE_LIMITED");
    expect((await search(other.token, "fine")).status).toBe(200);
    clock.advance(61_000);
    expect((await search(me.token, "later")).status).toBe(200);
  });
});
