import { describe, expect, it } from "vitest";

import { PresenceRegistry } from "./presence.registry.js";

describe("PresenceRegistry", () => {
  it("reports the first connection as online and the last disconnect as offline", () => {
    const registry = new PresenceRegistry();

    expect(registry.connect("user:1")).toBe(true);
    expect(registry.connect("user:1")).toBe(false);
    expect(registry.isOnline("user:1")).toBe(true);
    expect(registry.disconnect("user:1")).toBe(false);
    expect(registry.isOnline("user:1")).toBe(true);
    expect(registry.disconnect("user:1")).toBe(true);
    expect(registry.isOnline("user:1")).toBe(false);
  });

  it("ignores a disconnect it never saw", () => {
    expect(new PresenceRegistry().disconnect("admin:9")).toBe(false);
  });

  it("lists the admins that are online", () => {
    const registry = new PresenceRegistry();

    registry.connect("admin:2");
    registry.connect("user:2");
    registry.connect("admin:5");
    expect(registry.onlineAdminIds().sort()).toEqual([2, 5]);
  });
});
