import { describe, expect, it } from "vitest";

import { groupRoutes } from "@/features/chat-groups/utils/group-adapter-urls";
import { parseRouteId } from "@/features/chat-groups/utils/group-ids";

describe("groupRoutes", () => {
  it("asks the admin view with ?as=admin on every route", () => {
    const routes = groupRoutes(12, "admin");

    expect(routes.messages).toBe("/api/chat/groups/12/messages?as=admin");
    expect(routes.edits(5)).toBe(
      "/api/chat/groups/12/messages/5/edits?as=admin",
    );
    expect(routes.seenBy(5)).toBe(
      "/api/chat/groups/12/messages/5/seen?as=admin",
    );
    expect(routes.photos).toBe("/api/chat/groups/12/photos?as=admin");
  });

  it("leaves the trainee routes without a query", () => {
    const routes = groupRoutes(12, "user");

    expect(routes.messages).toBe("/api/chat/groups/12/messages");
    expect(routes.edits(5)).toBe("/api/chat/groups/12/messages/5/edits");
    expect(routes.seenBy(5)).toBe("/api/chat/groups/12/messages/5/seen");
    expect(routes.photos).toBe("/api/chat/groups/12/photos");
  });
});

describe("parseRouteId", () => {
  it("takes a positive integer the database can hold", () => {
    expect(parseRouteId("1")).toBe(1);
    expect(parseRouteId("2147483647")).toBe(2_147_483_647);
  });

  it.each(["0", "-1", "01", "1.5", "1e3", "abc", "", "2147483648", " 7"])(
    "refuses %j",
    (value) => {
      expect(parseRouteId(value)).toBeNull();
    },
  );

  it("refuses anything that is not a string", () => {
    expect(parseRouteId(5)).toBeNull();
    expect(parseRouteId(undefined)).toBeNull();
  });
});
