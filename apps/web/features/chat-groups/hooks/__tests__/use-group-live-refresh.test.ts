import { REALTIME_EVENTS } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { refreshesGroupInfo } from "@/features/chat-groups/hooks/use-group-live-refresh";

// Which socket events refresh an open group info page: only a member change
// (members, name, photo, managers-only, dissolve) of that very group.
describe("refreshesGroupInfo", () => {
  it("refreshes on group:members of this group", () => {
    expect(
      refreshesGroupInfo(REALTIME_EVENTS.groupMembers, { groupId: 3 }, 3),
    ).toBe(true);
  });

  it("ignores another group, messages, reads and bad payloads", () => {
    expect(
      refreshesGroupInfo(REALTIME_EVENTS.groupMembers, { groupId: 4 }, 3),
    ).toBe(false);
    expect(
      refreshesGroupInfo(
        REALTIME_EVENTS.groupMessage,
        { groupId: 3, messageId: 9 },
        3,
      ),
    ).toBe(false);
    expect(
      refreshesGroupInfo(
        REALTIME_EVENTS.groupRead,
        { groupId: 3, readerKey: "user:1", lastReadMessageId: 9 },
        3,
      ),
    ).toBe(false);
    for (const data of [null, undefined, "3", { groupId: "3" }]) {
      expect(refreshesGroupInfo(REALTIME_EVENTS.groupMembers, data, 3)).toBe(
        false,
      );
    }
    expect(refreshesGroupInfo("inbox", { groupId: 3 }, 3)).toBe(false);
  });
});
