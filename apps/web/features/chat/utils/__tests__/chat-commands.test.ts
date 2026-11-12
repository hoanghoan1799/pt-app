import { describe, expect, it } from "vitest";

import {
  CHAT_COMMANDS,
  composeCommandMessage,
  extractLeadingCommand,
  findCommandHint,
  matchCommandSuggestions,
  parseChatCommand,
} from "@/features/chat/utils/chat-commands";

const imlang = CHAT_COMMANDS[0];

describe("parseChatCommand", () => {
  it("strips /imlang and marks the message silent", () => {
    expect(parseChatCommand("/imlang nhắn tin sau nhé")).toEqual({
      body: "nhắn tin sau nhé",
      command: imlang,
      effects: { silent: true },
    });
  });

  it.each(["/IMLANG hi", "/imlang\nhi", "/Imlang   hi  "])(
    "parses %j to body hi",
    (text) => {
      const parsed = parseChatCommand(text);

      expect(parsed.body).toBe("hi");
      expect(parsed.effects.silent).toBe(true);
    },
  );

  it("gives an empty body for the bare command", () => {
    expect(parseChatCommand("/imlang")).toEqual({
      body: "",
      command: imlang,
      effects: { silent: true },
    });
    expect(parseChatCommand("/imlang   ").body).toBe("");
  });

  it.each(["/imlangx hi", "/abc hi", "hi /imlang", "/ hello", "/imlang-x"])(
    "leaves %j as plain text",
    (text) => {
      expect(parseChatCommand(text)).toEqual({
        body: text,
        command: null,
        effects: {},
      });
    },
  );

  it("trims plain text", () => {
    expect(parseChatCommand("  hello ").body).toBe("hello");
  });
});

describe("matchCommandSuggestions", () => {
  it.each(["/", "/i", "/im", "/IMLANG"])("suggests /imlang for %j", (text) => {
    expect(matchCommandSuggestions(text)).toEqual([imlang]);
  });

  it.each(["", "hi", "/x", "/imlang ", "/imlang hi", "/imlangx", " /i"])(
    "suggests nothing for %j",
    (text) => {
      expect(matchCommandSuggestions(text)).toEqual([]);
    },
  );
});

describe("findCommandHint", () => {
  it("returns the hint of a leading command", () => {
    expect(findCommandHint("/imlang ")).toBe("Gửi không thông báo");
    expect(findCommandHint("/imlang hi")).toBe("Gửi không thông báo");
  });

  it.each(["", "/", "/im", "/abc hi", "hi /imlang"])(
    "returns null for %j",
    (text) => {
      expect(findCommandHint(text)).toBeNull();
    },
  );
});

describe("extractLeadingCommand", () => {
  it("splits a known command from the text after it", () => {
    expect(extractLeadingCommand("/imlang hi there")).toEqual({
      command: imlang,
      rest: "hi there",
    });
    expect(extractLeadingCommand("/IMLANG ")).toEqual({
      command: imlang,
      rest: "",
    });
    expect(extractLeadingCommand("/imlang\nhi")).toEqual({
      command: imlang,
      rest: "hi",
    });
  });

  it.each(["/imlang", "/imlangx hi", "/abc hi", "hi /imlang ", " /imlang hi"])(
    "returns null for %j",
    (text) => {
      expect(extractLeadingCommand(text)).toBeNull();
    },
  );
});

describe("composeCommandMessage", () => {
  it("round-trips through parseChatCommand", () => {
    const message = composeCommandMessage(imlang, "hi");

    expect(message).toBe("/imlang hi");
    expect(parseChatCommand(message)).toMatchObject({
      body: "hi",
      command: imlang,
    });
  });
});
