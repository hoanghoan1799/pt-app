import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AdminAvatar } from "../src/database/entities/admin-avatar.entity.js";
import { UserAvatar } from "../src/database/entities/user-avatar.entity.js";
import { seedConversation } from "./support/auth.js";
import { call, PNG_BASE64 } from "./support/http.js";
import {
  befriend,
  createSocialWorld,
  destroySocialWorld,
  hide,
  revealHidden,
  type SocialWorld,
} from "./support/social.js";

// Who may fetch a trainee's photo (KAN-157 follow-up): the trainee, a super
// admin, the PT of the workspace (hidden trainees only once revealed) and a
// trainee who can see them socially. Everyone else gets the missing-photo 404.
let w: SocialWorld;

beforeAll(async () => {
  w = await createSocialWorld();
  const png = Buffer.from(PNG_BASE64, "base64");

  for (const id of [w.ids.ann, w.ids.ben, w.ids.cat, w.ids.dan, w.ids.pat]) {
    await w.ds.getRepository(UserAvatar).insert({
      userId: id,
      mime: "image/png",
      data: png,
      size: png.length,
      updatedAt: new Date(),
    });
  }
  await w.ds.getRepository(AdminAvatar).insert({
    adminId: w.ids.ptA,
    mime: "image/png",
    data: png,
    size: png.length,
    updatedAt: new Date(),
  });
});

afterAll(() => destroySocialWorld(w));

const fetchAvatar = (kind: "user" | "admin", id: number, token: string) =>
  call(w.app, "get", `/v1/avatars/${kind}/${id}`, token);

const expectBytes = async (res: ReturnType<typeof fetchAvatar>) => {
  const response = await res;

  expect(response.status).toBe(200);
  expect(response.headers["cache-control"]).toMatch(/^private/);
  expect(Buffer.from(response.body).toString("base64")).toBe(PNG_BASE64);
};

const expectMissing = async (res: ReturnType<typeof fetchAvatar>) => {
  const response = await res;

  expect(response.status).toBe(404);
  expect(response.body).toMatchObject({
    code: "AVATAR_NOT_FOUND",
    message: "not_found",
  });
};

describe("GET /v1/avatars/user/:id visibility", () => {
  it("shows a trainee their own photo", async () => {
    await expectBytes(fetchAvatar("user", w.ids.ann, w.tokens.ann));
  });

  it("shows any trainee to a super admin", async () => {
    await expectBytes(fetchAvatar("user", w.ids.dan, w.tokens.superAdmin));
  });

  it("shows a PT the trainees of their workspace only", async () => {
    await expectBytes(fetchAvatar("user", w.ids.ann, w.tokens.ptA));
    await expectMissing(fetchAvatar("user", w.ids.dan, w.tokens.ptA));
  });

  it("hides a trainee the PT hid until they reveal hidden trainees", async () => {
    await hide(w.ds, w.ids.ptP, w.ids.pat);
    const unlocked = await call(
      w.app,
      "post",
      "/v1/admins/me/passcode/verify",
      w.tokens.ptP,
      { passcode: "4321" },
    );

    expect(unlocked.status).toBeLessThan(300);
    await expectMissing(fetchAvatar("user", w.ids.pat, w.tokens.ptP));
    await revealHidden(w.app, w.tokens.ptP, "4321");
    await expectBytes(fetchAvatar("user", w.ids.pat, w.tokens.ptP));
  });

  it("shows a trainee a friend, and denies once either side blocks", async () => {
    await expectMissing(fetchAvatar("user", w.ids.ben, w.tokens.ann));
    await befriend(w.ds, w.ids.ann, w.ids.ben);
    await expectBytes(fetchAvatar("user", w.ids.ben, w.tokens.ann));
    await expectBytes(fetchAvatar("user", w.ids.ann, w.tokens.ben));
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.ben, w.ids.ann],
    );
    await expectMissing(fetchAvatar("user", w.ids.ben, w.tokens.ann));
    await expectMissing(fetchAvatar("user", w.ids.ann, w.tokens.ben));
  });

  it("shows a trainee a direct-message partner unless blocked", async () => {
    await w.ds.query(
      `INSERT INTO dm_conversations (user_low, user_high, created_at) VALUES ($1, $2, now())`,
      [Math.min(w.ids.cat, w.ids.dan), Math.max(w.ids.cat, w.ids.dan)],
    );
    await expectBytes(fetchAvatar("user", w.ids.dan, w.tokens.cat));
    await w.ds.query(
      `INSERT INTO social_blocks (blocker_id, blocked_id, created_at) VALUES ($1, $2, now())`,
      [w.ids.cat, w.ids.dan],
    );
    await expectMissing(fetchAvatar("user", w.ids.dan, w.tokens.cat));
  });

  it("shows the author of a post the viewer can see, by the post's privacy", async () => {
    const author = w.ids.pat;
    const viewer = w.tokens.ben;

    await expectMissing(fetchAvatar("user", author, viewer));
    await w.ds.query(
      `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
       VALUES ('user', $1, 'only_me', now(), now()),
              ('user', $1, 'friends', now(), now())`,
      [author],
    );
    await expectMissing(fetchAvatar("user", author, viewer));
    await w.ds.query(
      `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at)
       VALUES ('user', $1, 'everyone', now(), now())`,
      [author],
    );
    await expectBytes(fetchAvatar("user", author, viewer));
  });

  it("ignores a deleted post", async () => {
    const author = w.ids.dan;
    const viewer = w.tokens.ben;

    await w.ds.query(
      `INSERT INTO social_posts (author_kind, author_id, privacy, created_at, updated_at, deleted_at)
       VALUES ('user', $1, 'everyone', now(), now(), now())`,
      [author],
    );
    await expectMissing(fetchAvatar("user", author, viewer));
  });

  it("denies an unrelated trainee, with the same answer as a missing photo", async () => {
    await expectMissing(fetchAvatar("user", w.ids.cat, w.tokens.ann));
    const missing = await fetchAvatar("user", 2_000_000, w.tokens.dan);
    const denied = await fetchAvatar("user", w.ids.ann, w.tokens.dan);

    expect(denied.status).toBe(missing.status);
    expect(denied.body).toMatchObject({
      code: missing.body.code,
      message: missing.body.message,
    });
  });

  it("keeps admin photos readable by a trainee who has a conversation", async () => {
    await expectMissing(fetchAvatar("admin", w.ids.ptA, w.tokens.dan));
    await seedConversation(w.ds, w.ids.dan);
    await expectBytes(fetchAvatar("admin", w.ids.ptA, w.tokens.dan));
  });
});
