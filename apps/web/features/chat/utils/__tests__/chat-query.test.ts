import { describe, expect, it } from "vitest";

import { threadQueryOf } from "@/features/chat/utils/chat-query";

const params = (query: string) => new URLSearchParams(query);

describe("threadQueryOf", () => {
  it("passes the polling state through", () => {
    expect(
      threadQueryOf(
        params("after=10&readUpTo=8&enabled=1&changedSince=1700000000000"),
      ),
    ).toEqual({
      after: 10,
      before: undefined,
      around: undefined,
      readUpTo: 8,
      enabled: "1",
      changedSince: 1700000000000,
    });
  });

  it("drops anything that is not a plain number or flag", () => {
    expect(
      threadQueryOf(
        params("after=abc&before=-5&readUpTo=1e3&enabled=yes&around=2"),
      ),
    ).toEqual({
      after: undefined,
      before: undefined,
      around: 2,
      readUpTo: undefined,
      enabled: undefined,
      changedSince: undefined,
    });
  });

  it("keeps a locked flag", () => {
    expect(threadQueryOf(params("enabled=0")).enabled).toBe("0");
  });
});
