import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminAvatar } from "../src/database/entities/admin-avatar.entity.js";
import { UserAvatar } from "../src/database/entities/user-avatar.entity.js";
import { avatarToken } from "../src/files/image-rules.js";
import { call, PNG_BASE64 } from "./support/http.js";
import {
  createSocialWorld,
  destroySocialWorld,
  social,
  type SocialWorld,
} from "./support/social.js";

// Avatar URLs are signed (HMAC over kind, id and version): a valid token is the
// capability, so every URL the API hands out loads for the signed-in actor it
// was handed to. Anything else answers like a missing photo.
let w: SocialWorld;
let api: ReturnType<typeof social>;

beforeAll(async () => {
  w = await createSocialWorld();
  api = social(w.app);
  const png = Buffer.from(PNG_BASE64, "base64");

  for (const id of [w.ids.ann, w.ids.ben, w.ids.cat, w.ids.dan]) {
    await w.ds.getRepository(UserAvatar).insert({
      userId: id,
      mime: "image/png",
      data: png,
      size: png.length,
      updatedAt: new Date(1_700_000_000_000),
    });
  }
  await w.ds.query(
    `UPDATE users SET avatar_updated_at = $1 WHERE id = ANY($2::int[])`,
    [new Date(1_700_000_000_000), [w.ids.ann, w.ids.ben, w.ids.cat, w.ids.dan]],
  );
  await w.ds.query(`UPDATE admins SET avatar_updated_at = $1 WHERE id = $2`, [
    new Date(1_700_000_000_000),
    w.ids.ptA,
  ]);
  await w.ds.getRepository(AdminAvatar).insert({
    adminId: w.ids.ptA,
    mime: "image/png",
    data: png,
    size: png.length,
    updatedAt: new Date(1_700_000_000_000),
  });
});

afterAll(() => destroySocialWorld(w));

const get = (path: string, token?: string) => call(w.app, "get", path, token);

const expectBytes = async (path: string, token: string) => {
  const response = await get(path, token);

  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toMatch(/^private/);
  expect(Buffer.from(response.body).toString("base64")).toBe(PNG_BASE64);
};

const expectMissing = async (path: string, token: string) => {
  const response = await get(path, token);
  const missing = await get("/v1/avatars/user/2000000", token);

  expect(response.status).toBe(404);
  expect(response.body).toMatchObject({
    code: "AVATAR_NOT_FOUND",
    message: "not_found",
  });
  expect(response.body).toMatchObject({
    code: missing.body.code,
    message: missing.body.message,
  });
};

const signed = (kind: "user" | "admin", id: number, version = "1700000000") =>
  `/v1/avatars/${kind}/${id}?v=${version}&t=${avatarToken(kind, id, version)}`;

describe("GET /v1/avatars/:kind/:id with signed URLs", () => {
  it("serves a valid token to any signed-in actor, trainee or admin", async () => {
    await expectBytes(signed("user", w.ids.ann), w.tokens.dan);
    await expectBytes(signed("user", w.ids.ann), w.tokens.ptB);
    await expectBytes(signed("user", w.ids.ann), w.tokens.superAdmin);
    await expectBytes(signed("admin", w.ids.ptA), w.tokens.dan);
  });

  it("serves a trainee's own photo without a token", async () => {
    await expectBytes(`/v1/avatars/user/${w.ids.ann}`, w.tokens.ann);
  });

  it("answers like a missing photo without a token (probing by id) or with a bad one", async () => {
    const ok = signed("user", w.ids.ann);
    const token = avatarToken("user", w.ids.ann, "1700000000");
    const other = avatarToken("user", w.ids.ben, "1700000000");
    const bad = [
      `/v1/avatars/user/${w.ids.ann}`,
      `/v1/avatars/user/${w.ids.ann}?v=1700000000`,
      `/v1/avatars/user/${w.ids.ann}?v=1700000000&t=`,
      `${ok.slice(0, -1)}${ok.endsWith("A") ? "B" : "A"}`,
      `/v1/avatars/user/${w.ids.ann}?v=1700000000&t=${other}`,
      `/v1/avatars/admin/${w.ids.ptA}?v=1700000000&t=${token}`,
      // A token for an older version of the photo.
      signed("user", w.ids.ann, "1600000000"),
    ];

    for (const path of bad) {
      await expectMissing(path, w.tokens.dan);
    }
    // Staff do not get a free pass either.
    await expectMissing(`/v1/avatars/user/${w.ids.ann}`, w.tokens.ptA);
    await expectMissing(`/v1/avatars/user/${w.ids.ann}`, w.tokens.superAdmin);
  });

  it("stops serving a URL once the photo is replaced", async () => {
    const url = signed("user", w.ids.cat);

    await expectBytes(url, w.tokens.dan);
    await w.ds
      .getRepository(UserAvatar)
      .update(
        { userId: w.ids.cat },
        { updatedAt: new Date(1_700_000_100_000) },
      );
    await expectMissing(url, w.tokens.dan);
    // Restore the version the later payload checks use.
    await w.ds
      .getRepository(UserAvatar)
      .update(
        { userId: w.ids.cat },
        { updatedAt: new Date(1_700_000_000_000) },
      );
  });

  it("loads the URLs the social payloads hand out", async () => {
    const email = (
      await w.ds.query(`SELECT email FROM users WHERE id = $1`, [w.ids.ben])
    )[0].email as string;

    // People search by exact email.
    const found = await api.get(
      `/people?email=${encodeURIComponent(email)}`,
      w.tokens.dan,
    );

    expect(found.body.result.avatarUrl).toMatch(/&t=/);
    await expectBytes(found.body.result.avatarUrl, w.tokens.dan);

    // Friend requests, incoming and outgoing.
    await api.post("/friends/requests", w.tokens.dan, { userId: w.ids.ben });
    const asBen = await api.get("/friends/requests", w.tokens.ben);
    const asDan = await api.get("/friends/requests", w.tokens.dan);

    await expectBytes(asBen.body.received[0].avatarUrl, w.tokens.ben);
    await expectBytes(asDan.body.sent[0].avatarUrl, w.tokens.dan);

    // The viewer's own blocks list.
    await api.put(`/blocks/${w.ids.cat}`, w.tokens.dan);
    const blocks = await api.get("/blocks", w.tokens.dan);

    expect(blocks.body.items[0].id).toBe(w.ids.cat);
    await expectBytes(blocks.body.items[0].avatarUrl, w.tokens.dan);
  });

  it("lets a PT load the URL of an out-of-scope trainee who commented on their post", async () => {
    const post = await api.post("/posts", w.tokens.ptA, {
      caption: "hello",
      privacy: "everyone",
    });
    const postId = post.body.post.id as number;

    expect(
      (
        await api.post(`/posts/${postId}/comments`, w.tokens.dan, {
          body: "hi coach",
        })
      ).status,
    ).toBe(201);
    const comments = await api.get(`/posts/${postId}/comments`, w.tokens.ptA);
    const fromDan = comments.body.items.find(
      (item: { authorId: number }) => item.authorId === w.ids.dan,
    );

    expect(fromDan.authorAvatarUrl).toMatch(/&t=/);
    await expectBytes(fromDan.authorAvatarUrl, w.tokens.ptA);
  });
});
