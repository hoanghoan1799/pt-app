import { REALTIME_EVENTS } from "@pt/contracts";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { callWith, pngBytes } from "./support/chat.js";
import {
  adminIn,
  createGroupWorld,
  destroyGroupWorld,
  groupsApi,
  type GroupWorld,
  type Person,
  traineeIn,
} from "./support/groups.js";
import { newEndpoint, subscriptionBody } from "./support/push.js";
import {
  connectClient,
  listenOnRandomPort,
  pause,
  type TestClient,
} from "./support/realtime.js";

// Company group-realtime (Ably channel chat:group:<id>) became Socket.IO
// rooms; company group-push.test.ts against the push module. Real sockets and
// a fake web push sender.

let w: GroupWorld;
let api: ReturnType<typeof groupsApi>;
let url: string;
let superAdmin: Person;
let pt: Person;
const open: TestClient[] = [];

beforeAll(async () => {
  w = await createGroupWorld();
  api = groupsApi(w);
  url = await listenOnRandomPort(w.app);
  superAdmin = await adminIn(w, "super_admin");
  pt = await adminIn(w, "pt");
});

afterEach(() => {
  for (const client of open.splice(0)) {
    client.close();
  }
});

afterAll(async () => {
  // Pushes run after the response; let the last ones finish first.
  await pause(300);
  await destroyGroupWorld(w);
});

const socketOf = async (person: Person) => {
  const ticket = await callWith(
    w.app,
    "post",
    "/v1/realtime/ticket",
    person.token,
  );
  const client = await connectClient(url, { ticket: ticket.body.ticket });

  open.push(client);
  return client;
};

// Gives the server a moment to fan out, then asserts nothing arrived.
const nothingNamed = async (
  client: TestClient,
  name: string,
  groupId: number,
) => {
  await pause(250);
  expect(client.named(name).filter((data) => data.groupId === groupId)).toEqual(
    [],
  );
};

const forGroup = (groupId: number) => (data: Record<string, unknown>) =>
  data.groupId === groupId;

describe("realtime fan-out (company group-realtime)", () => {
  it("sends ids only to members and super admins, never to outsiders", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const outsider = await traineeIn(w, { ptAdminId: pt.id });
    const otherPt = await adminIn(w, "pt");
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const [annSocket, ptSocket, superSocket, outsiderSocket, otherPtSocket] =
      await Promise.all([ann, pt, superAdmin, outsider, otherPt].map(socketOf));
    const mid = await api.sendId(ann.token, groupId, { body: "secret text" });

    for (const client of [annSocket, ptSocket, superSocket]) {
      const data = await client.waitFor(
        REALTIME_EVENTS.groupMessage,
        forGroup(groupId),
      );

      expect(data).toEqual({ groupId, messageId: mid });
    }
    await nothingNamed(outsiderSocket, REALTIME_EVENTS.groupMessage, groupId);
    await nothingNamed(otherPtSocket, REALTIME_EVENTS.groupMessage, groupId);
    expect(JSON.stringify(ptSocket.received)).not.toContain("secret text");

    await api.react(pt.token, groupId, mid, "👍");
    expect(
      await annSocket.waitFor(
        REALTIME_EVENTS.groupMessageUpdate,
        forGroup(groupId),
      ),
    ).toEqual({ groupId, messageId: mid });
    await api.read(ann.token, groupId, mid);
    expect(
      await ptSocket.waitFor(REALTIME_EVENTS.groupRead, forGroup(groupId)),
    ).toEqual({ groupId, readerKey: ann.key, lastReadMessageId: mid });
    await nothingNamed(outsiderSocket, REALTIME_EVENTS.groupRead, groupId);
  });

  it("starts an added member's open sockets and stops a removed member's at once", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const ben = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const benSocket = await socketOf(ben);
    const annSocket = await socketOf(ann);

    await api.add(pt.token, groupId, { userIds: [ben.id] });
    await benSocket.waitFor(REALTIME_EVENTS.groupMembers, forGroup(groupId));
    const first = await api.sendId(pt.token, groupId);

    expect(
      await benSocket.waitFor(
        REALTIME_EVENTS.groupMessage,
        (data) => data.messageId === first,
      ),
    ).toEqual({ groupId, messageId: first });

    await api.remove(pt.token, groupId, ben.key);
    await annSocket.waitFor(
      REALTIME_EVENTS.groupMembers,
      (data) => data.groupId === groupId,
    );
    const before = benSocket.received.length;

    await api.sendId(pt.token, groupId);
    await api.rename(pt.token, groupId, "Renamed");
    await pause(250);
    expect(
      benSocket.received
        .slice(before)
        .filter((item) => item.data?.groupId === groupId),
    ).toEqual([]);
  });

  it("stops a member who left, also on a socket that reconnects", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });

    await api.leave(ann.token, groupId);
    const fresh = await socketOf(ann);

    await api.sendId(pt.token, groupId);
    await nothingNamed(fresh, REALTIME_EVENTS.groupMessage, groupId);
  });

  it("joins a member's groups on connect", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const annSocket = await socketOf(ann);
    const mid = await api.sendId(pt.token, groupId);

    expect(
      await annSocket.waitFor(REALTIME_EVENTS.groupMessage, forGroup(groupId)),
    ).toEqual({ groupId, messageId: mid });
  });

  it("sends the PT-change alert to super admins only", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const newPt = await adminIn(w, "pt");
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const [annSocket, ptSocket, superSocket] = await Promise.all(
      [ann, pt, superAdmin].map(socketOf),
    );

    await callWith(
      w.app,
      "put",
      `/v1/trainees/${ann.id}/pt`,
      superAdmin.token,
      {
        body: { ptAdminId: newPt.id },
      },
    );
    const alert = await superSocket.waitFor(
      REALTIME_EVENTS.groupMessage,
      forGroup(groupId),
    );
    const row = await w.ds.query(
      `SELECT audience FROM chat_group_messages WHERE id = $1`,
      [alert.messageId],
    );

    expect(row[0].audience).toBe("super_admin");
    await nothingNamed(annSocket, REALTIME_EVENTS.groupMessage, groupId);
    await nothingNamed(ptSocket, REALTIME_EVENTS.groupMessage, groupId);

    // A newer change supersedes it: open threads hear the update.
    await callWith(
      w.app,
      "put",
      `/v1/trainees/${ann.id}/pt`,
      superAdmin.token,
      {
        body: { ptAdminId: pt.id },
      },
    );
    expect(
      await superSocket.waitFor(
        REALTIME_EVENTS.groupMessageUpdate,
        (data) => data.messageId === alert.messageId,
      ),
    ).toEqual({ groupId, messageId: alert.messageId });
    await nothingNamed(annSocket, REALTIME_EVENTS.groupMessageUpdate, groupId);
  });

  it("publishes a read only when the cursor moved", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const mid = await api.sendId(pt.token, groupId);
    const ptSocket = await socketOf(pt);

    await api.read(ann.token, groupId, mid);
    await ptSocket.waitFor(REALTIME_EVENTS.groupRead, forGroup(groupId));
    await api.read(ann.token, groupId, mid);
    await api.read(ann.token, groupId, 0);
    await pause(250);
    expect(
      ptSocket
        .named(REALTIME_EVENTS.groupRead)
        .filter((data) => data.groupId === groupId),
    ).toHaveLength(1);
  });

  it("tells the members once on dissolve and then nothing", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const annSocket = await socketOf(ann);

    await api.dissolve(superAdmin.token, groupId);
    await annSocket.waitFor(REALTIME_EVENTS.groupMembers, forGroup(groupId));
    // A super admin may still mute and mark read; the members hear no more.
    await api.mute(superAdmin.token, groupId, true);
    await api.read(superAdmin.token, groupId, 1);
    await nothingNamed(annSocket, REALTIME_EVENTS.groupRead, groupId);
  });
});

describe("web push (company group-push)", () => {
  beforeEach(async () => {
    w.sender.reset();
    await w.ds.query(`DELETE FROM push_subscriptions`);
  });

  const device = async (person: Person) => {
    const endpoint = newEndpoint();
    const response = await callWith(
      w.app,
      "post",
      "/v1/push/subscriptions",
      person.token,
      { body: subscriptionBody(endpoint) },
    );

    expect(response.status).toBe(204);
    return endpoint;
  };

  it("notifies members and super admins with their deep links, minus the sender and the muted", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id, name: "Ann" });
    const ben = await traineeIn(w, { ptAdminId: pt.id, name: "Ben" });
    const muted = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, {
      name: "Crew",
      userIds: [ann.id, ben.id, muted.id],
    });

    await api.mute(muted.token, groupId, true);
    const [annDevice, benDevice, mutedDevice, ptDevice, superDevice] =
      await Promise.all([ann, ben, muted, pt, superAdmin].map(device));

    await api.sendId(ann.token, groupId, { body: "see you at 6" });
    await w.sender.waitForCalls(3);
    await pause(200);
    expect(w.sender.calls).toHaveLength(3);
    expect(w.sender.to(annDevice)).toEqual([]);
    expect(w.sender.to(mutedDevice)).toEqual([]);
    expect(w.sender.to(benDevice)[0].payload).toEqual({
      title: "Crew",
      body: "Ann: see you at 6",
      url: `/messages/groups/${groupId}`,
      tag: `chat-group-${groupId}`,
    });
    expect(w.sender.to(ptDevice)[0].payload.url).toBe(
      `/admin/messages/groups/${groupId}`,
    );
    expect(w.sender.to(superDevice)[0].payload.url).toBe(
      `/admin/messages/groups/${groupId}`,
    );
  });

  it("leaves out a muted super admin and never pushes a member who left or was removed", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const gone = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, {
      userIds: [ann.id, gone.id],
    });

    await api.mute(superAdmin.token, groupId, true);
    await api.remove(pt.token, groupId, gone.key);
    const [goneDevice, superDevice, annDevice] = await Promise.all(
      [gone, superAdmin, ann].map(device),
    );

    await api.sendId(pt.token, groupId, { body: "hi" });
    await w.sender.waitForCalls(1);
    await pause(200);
    expect(w.sender.to(annDevice)).toHaveLength(1);
    expect(w.sender.to(goneDevice)).toEqual([]);
    expect(w.sender.to(superDevice)).toEqual([]);
  });

  it("names the sender per recipient: own nickname, else the real name, in the recipient's language", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id, name: "Ann Q" });
    const ben = await traineeIn(w, { ptAdminId: pt.id, name: "Ben Q" });
    const cat = await traineeIn(w, { ptAdminId: pt.id, name: "Cat Q" });
    const groupId = await api.createId(pt.token, {
      name: "Crew",
      userIds: [ann.id, ben.id, cat.id],
    });

    await w.ds.query(
      `INSERT INTO contact_aliases (owner_key, target_key, alias, updated_at)
       VALUES ($1, $2, 'Annie', now())`,
      [ben.key, ann.key],
    );
    await w.ds.query(`UPDATE users SET locale = 'en' WHERE id = $1`, [cat.id]);
    const [benDevice, catDevice] = await Promise.all([ben, cat].map(device));
    const photo = (await api.upload(ann.token, groupId, pngBytes())).body.photo
      .id as number;

    await api.send(ann.token, groupId, { photoIds: [photo] });
    await w.sender.waitForCalls(2);
    expect(w.sender.to(benDevice)[0].payload.body).toBe("Annie: Đã gửi ảnh");
    expect(w.sender.to(catDevice)[0].payload.body).toBe("Ann Q: Sent a photo");
  });

  it("pushes nothing for /imlang, a retry, a system line or a dissolved group", async () => {
    const ann = await traineeIn(w, { ptAdminId: pt.id });
    const groupId = await api.createId(pt.token, { userIds: [ann.id] });
    const annDevice = await device(ann);

    await api.send(pt.token, groupId, { body: "/imlang quiet" });
    await api.rename(pt.token, groupId, "New name");
    const key = "retry-key-0001";

    await api.send(pt.token, groupId, { body: "once" }, key);
    await w.sender.waitForCalls(1);
    await api.send(pt.token, groupId, { body: "once" }, key);
    await api.dissolve(superAdmin.token, groupId);
    await api.send(superAdmin.token, groupId, { body: "after" });
    await pause(300);
    expect(w.sender.to(annDevice).map((call) => call.payload.body)).toEqual([
      `${pt.name}: once`,
    ]);
  });
});
