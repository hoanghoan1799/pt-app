import { aliasValueSchema } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { CHAT_NICKNAME_VALUE_CHECK } from "../database/entities/chat-nickname.entity.js";
import {
  NICKNAME_PATTERN,
  NICKNAME_VALUE_CHECK,
} from "./1796000000000-ChatNicknameValue.js";

// The migration keeps its own copy of the nickname rule (it must not change
// later); the entity has another. migration:check compares CHECKs by name
// only, so this is what tells you the copies differ.
describe("ChatNicknameValue rule", () => {
  it("is the same expression in the migration and the entity", () => {
    expect(CHAT_NICKNAME_VALUE_CHECK).toBe(NICKNAME_VALUE_CHECK);
  });

  it("accepts what the schema stores and nothing it would change", () => {
    const shape = new RegExp(NICKNAME_PATTERN, "u");

    for (const typed of [
      "Bé Na",
      "  Thầy \t  Hoan ",
      "👍",
      "a\u3000b",
      "Coach\u00a0Hoan",
    ]) {
      const stored = aliasValueSchema.parse(typed);

      expect(shape.test(stored), JSON.stringify(typed)).toBe(true);
      // Anything the schema would rewrite is not a stored value.
      expect(shape.test(typed), JSON.stringify(typed)).toBe(stored === typed);
    }
  });
});
