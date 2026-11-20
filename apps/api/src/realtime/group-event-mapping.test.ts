import { groupRoom, INBOX_SUPER_ROOM, REALTIME_EVENTS } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import {
  mapGroupMembersChanged,
  mapGroupMessageSent,
  mapGroupMessageUpdated,
  mapGroupRead,
} from "./event-mapping.js";

// Company group-realtime.ts (Ably `chat:group:<id>`, ids only) on Socket.IO
// rooms: members through the group room, super admins through
// INBOX_SUPER_ROOM, the PT-change alert to super admins only.

describe("group emissions", () => {
  it("sends a new message as ids only to the group and the super admins, guarded", () => {
    const [emission] = mapGroupMessageSent({
      groupId: 4,
      messageId: 90,
      kind: "message",
      audience: null,
      push: {
        senderKey: "user:1",
        body: "secret",
        sticker: false,
        photoCount: 0,
      },
    });

    expect(emission).toEqual({
      event: REALTIME_EVENTS.groupMessage,
      data: { groupId: 4, messageId: 90 },
      rooms: [groupRoom(4), INBOX_SUPER_ROOM],
      guardGroup: { groupId: 4, superAdminsOnly: false },
    });
    expect(JSON.stringify(emission)).not.toContain("secret");
  });

  it("sends the PT-change alert and its updates to super admins only", () => {
    const sent = mapGroupMessageSent({
      groupId: 4,
      messageId: 91,
      kind: "system",
      audience: "super_admin",
      push: null,
    });
    const updated = mapGroupMessageUpdated({
      groupId: 4,
      messageId: 91,
      audience: "super_admin",
    });

    for (const [emission] of [sent, updated]) {
      expect(emission.rooms).toEqual([INBOX_SUPER_ROOM]);
      expect(emission.guardGroup).toEqual({
        groupId: 4,
        superAdminsOnly: true,
      });
    }
  });

  it("maps edits, reactions and hides to message-update and the cursor to read", () => {
    expect(
      mapGroupMessageUpdated({ groupId: 4, messageId: 9, audience: null })[0],
    ).toMatchObject({
      event: REALTIME_EVENTS.groupMessageUpdate,
      data: { groupId: 4, messageId: 9 },
      rooms: [groupRoom(4), INBOX_SUPER_ROOM],
    });
    expect(
      mapGroupRead({
        groupId: 4,
        readerKey: "user:2",
        lastReadMessageId: 9,
      })[0],
    ).toMatchObject({
      event: REALTIME_EVENTS.groupRead,
      data: { groupId: 4, readerKey: "user:2", lastReadMessageId: 9 },
      guardGroup: { groupId: 4, superAdminsOnly: false },
    });
  });

  it("joins added members before and drops removed members after the members event", () => {
    const [emission] = mapGroupMembersChanged({
      groupId: 4,
      joined: ["user:2"],
      left: ["admin:3"],
      dissolved: false,
    });

    expect(emission).toMatchObject({
      event: REALTIME_EVENTS.groupMembers,
      data: { groupId: 4 },
      guardGroup: { groupId: 4, superAdminsOnly: false },
      join: { accounts: ["user:2"], room: groupRoom(4) },
      leave: { accounts: ["admin:3"], room: groupRoom(4) },
    });
  });

  it("tells every member once on dissolve and empties the room", () => {
    const [emission] = mapGroupMembersChanged({
      groupId: 4,
      joined: [],
      left: [],
      dissolved: true,
    });

    expect(emission.guardGroup).toBeUndefined();
    expect(emission.join).toBeUndefined();
    expect(emission.leave).toEqual({
      accounts: [],
      room: groupRoom(4),
      everyone: true,
    });
  });
});
