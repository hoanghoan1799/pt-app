import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PUSH_SENDERS } from "../src/push/push-sender.js";
import { callWith, newKey } from "./support/chat.js";
import {
  FakeWebSender,
  newEndpoint,
  subscriptionBody,
} from "./support/push.js";
import { pause } from "./support/realtime.js";
import {
  createSocialWorld,
  destroySocialWorld,
  social,
  type SocialWorld,
} from "./support/social.js";

const sender = new FakeWebSender();
let w: SocialWorld;
let api: ReturnType<typeof social>;

beforeAll(async () => {
  w = await createSocialWorld({
    overrideProviders: [{ token: PUSH_SENDERS, value: [sender] }],
  });
  api = social(w.app);
  await w.ds.query(`UPDATE users SET chat_enabled = true WHERE id = ANY($1)`, [
    [w.ids.ann, w.ids.ben],
  ]);
});

afterAll(async () => {
  await pause(300);
  await destroySocialWorld(w);
});

beforeEach(async () => {
  sender.reset();
  await w.ds.query(`DELETE FROM push_subscriptions`);
});

const device = async (token: string) => {
  const endpoint = newEndpoint();
  const response = await callWith(
    w.app,
    "post",
    "/v1/push/subscriptions",
    token,
    {
      body: subscriptionBody(endpoint),
    },
  );

  expect(response.status).toBe(204);
  return endpoint;
};

const createPost = async (
  who: keyof SocialWorld["tokens"],
  caption: string,
  privacy: "everyone" | "friends" | "only_me" = "everyone",
) => {
  const response = await api.post("/posts", w.tokens[who], {
    caption,
    privacy,
  });

  expect(response.status).toBe(201);
  return response.body.post.id as number;
};

describe("social pushes", () => {
  it("pushes a friend request to the asked person", async () => {
    const ben = await device(w.tokens.ben);

    await api.post("/friends/requests", w.tokens.ann, { userId: w.ids.ben });

    await sender.waitForCalls(1);
    expect(sender.to(ben)[0].payload).toEqual({
      title: "PT App",
      body: "Ann đã gửi lời mời kết bạn",
      url: "/friends?tab=requests",
      tag: "social-friend_request",
    });
  });

  it("pushes a comment with a preview to the post's author, in their language", async () => {
    const id = await createPost("ben", "bài của Ben");
    const ben = await device(w.tokens.ben);
    const ann = await device(w.tokens.ann);

    await w.ds.query(`UPDATE users SET locale = 'en' WHERE id = $1`, [
      w.ids.ben,
    ]);
    await api.post(`/posts/${id}/comments`, w.tokens.ann, {
      body: "Nice   post\nwell done",
    });

    await sender.waitForCalls(1);
    expect(sender.to(ben)[0].payload).toEqual({
      title: "PT App",
      body: "Ann commented: Nice post well done",
      url: `/post/${id}`,
      tag: `social-comment-${id}`,
    });
    // Nobody is told about their own comment.
    expect(sender.to(ann)).toEqual([]);
    await w.ds.query(`UPDATE users SET locale = NULL WHERE id = $1`, [
      w.ids.ben,
    ]);
  });

  it("uses the recipient's own nickname for the person who acted", async () => {
    const id = await createPost("ben", "đặt biệt danh");
    const ben = await device(w.tokens.ben);

    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Annie', now())`,
      [`user:${w.ids.ben}`, `user:${w.ids.ann}`],
    );
    await api.post(`/posts/${id}/comments`, w.tokens.ann, { body: "hi" });

    await sender.waitForCalls(1);
    expect(sender.to(ben)[0].payload.body).toBe("Annie đã bình luận: hi");
  });

  it("pushes at most one reaction an hour per post", async () => {
    const id = await createPost("ben", "thả tim");
    const ben = await device(w.tokens.ben);
    const react = (who: keyof SocialWorld["tokens"]) =>
      api.put(`/posts/${id}/reaction`, w.tokens[who], { emoji: "❤️" });

    await react("cat");
    await sender.waitForCalls(1);
    expect(sender.to(ben)[0].payload).toMatchObject({
      title: "PT App",
      url: `/post/${id}`,
      tag: `social-react-${id}`,
    });
    await react("dan");
    await pause(300);
    expect(sender.calls).toHaveLength(1);

    w.clock.advance(61 * 60 * 1000);
    await api.delete(`/posts/${id}/reaction`, w.tokens.dan);
    await react("dan");
    await sender.waitForCalls(2);
  });

  it("pushes a new admin post to the trainees who can see it, with the caption", async () => {
    const ann = await device(w.tokens.ann);
    const dan = await device(w.tokens.dan);
    const id = await createPost("ptA", "Lịch tuần mới");

    await sender.waitForCalls(1);
    expect(sender.to(ann)[0].payload).toEqual({
      title: "PT App",
      body: `${w.admins.ptA.username} vừa đăng bài mới: Lịch tuần mới`,
      url: `/post/${id}`,
      tag: `social-post-${id}`,
    });
    await pause(300);
    // An "everyone" post of PT A reaches PT A's workspace, not PT B's trainee.
    expect(sender.to(dan)).toEqual([]);
  });
});

describe("quoting a post in the coach chat", () => {
  const sendAnn = (body: object) =>
    callWith(
      w.app,
      "post",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
      {
        body,
        headers: { "Idempotency-Key": newKey() },
      },
    );
  const sendPt = (body: object) =>
    callWith(
      w.app,
      "post",
      `/v1/chat/trainees/${w.ids.ann}/messages`,
      w.tokens.ptA,
      {
        body,
        headers: { "Idempotency-Key": newKey() },
      },
    );

  it("lets a trainee quote a post a PT wrote, shown with its author and caption", async () => {
    const id = await createPost("ptA", "Bài tập tuần này");
    const response = await sendAnn({ body: "hay quá", postId: id });

    expect(response.status).toBe(201);
    expect(response.body.message.post).toEqual({
      id,
      available: true,
      authorName: w.admins.ptA.username,
      authorAvatarUrl: null,
      caption: "Bài tập tuần này",
      photo: null,
    });
  });

  it("refuses a post a trainee wrote, and a post nobody may see", async () => {
    const trainees = await createPost("ben", "bài của Ben");
    const hidden = await createPost("ptA", "chỉ mình tôi", "only_me");

    for (const postId of [trainees, hidden, 999999]) {
      const response = await sendAnn({ body: "trích", postId });

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ code: "POST_NOT_FOUND" });
    }
  });

  it("lets a PT quote a post of this conversation's trainee only", async () => {
    const own = await createPost("ann", "bài của Ann");
    const foreign = await createPost("ben", "bài của Ben");
    const onlyMe = await createPost("ann", "riêng tư", "only_me");

    const ok = await sendPt({ body: "bài đẹp", postId: own });

    expect(ok.status).toBe(201);
    expect(ok.body.message.post).toMatchObject({
      id: own,
      available: true,
      authorName: "Ann",
      caption: "bài của Ann",
    });
    expect((await sendPt({ body: "trích", postId: foreign })).status).toBe(404);
    // A PT has admin rights over the trainees of their workspace, private
    // posts included.
    expect((await sendPt({ body: "riêng", postId: onlyMe })).status).toBe(201);
  });

  it("shows a quoted post that is gone as unavailable, and nothing else about it", async () => {
    const id = await createPost("ptA", "sắp xóa");

    await sendAnn({ body: "lưu lại", postId: id });
    expect(
      (await api.delete(`/posts/${id}`, w.tokens.ptA)).status,
    ).toBeLessThan(300);
    const thread = await callWith(
      w.app,
      "get",
      "/v1/chat/conversations/me/messages",
      w.tokens.ann,
    );
    const quoted = (thread.body.messages as { post: unknown }[]).find(
      (message) => (message.post as { id?: number } | null)?.id === id,
    );

    expect(quoted?.post).toEqual({ id, available: false });
  });
});
