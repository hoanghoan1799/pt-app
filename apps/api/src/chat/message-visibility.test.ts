import { describe, expect, it } from "vitest";

import { goneAtSql, liveMessageSql } from "./message-visibility.js";

describe("message visibility SQL", () => {
  it("reads a hidden message as deleted at its creation time", () => {
    expect(goneAtSql("m")).toBe(
      "COALESCE(m.deleted_at, CASE WHEN m.hidden_by_admin_id IS NOT NULL THEN m.created_at END)",
    );
    expect(goneAtSql()).toBe(
      "COALESCE(deleted_at, CASE WHEN hidden_by_admin_id IS NOT NULL THEN created_at END)",
    );
  });

  it("keeps live messages only", () => {
    expect(liveMessageSql("m")).toBe(
      "m.deleted_at IS NULL AND m.hidden_by_admin_id IS NULL",
    );
  });
});
