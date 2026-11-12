import { describe, expect, it } from "vitest";

import {
  extractTicketKeys,
  pickTransition,
  type PullRequestEvent,
  targetStatusFor,
} from "@/scripts/jira-transition-rules";

const event = (overrides: Partial<PullRequestEvent>): PullRequestEvent => ({
  action: "opened",
  title: "fix(KAN-14): something",
  headRef: "feat/KAN-14-something",
  draft: false,
  merged: false,
  ...overrides,
});

describe("extractTicketKeys", () => {
  it("reads keys from the title and branch without duplicates", () => {
    expect(
      extractTicketKeys("fix(KAN-14): trim names", "feat/KAN-14-trim"),
    ).toEqual(["KAN-14"]);
  });

  it("collects several keys and upper-cases a lowercase branch", () => {
    expect(
      extractTicketKeys("chore(KAN-15, KAN-16): tooling", "feat/kan-17-x"),
    ).toEqual(["KAN-15", "KAN-16", "KAN-17"]);
  });

  it("ignores text without a full key", () => {
    expect(extractTicketKeys("Bump deps", "claude/thread-kan")).toEqual([]);
    expect(extractTicketKeys("XKAN-3 and KAN-", "main")).toEqual([]);
  });
});

describe("targetStatusFor", () => {
  it("moves an opened, reopened or ready PR to In Review", () => {
    expect(targetStatusFor(event({ action: "opened" }))).toBe("In Review");
    expect(targetStatusFor(event({ action: "reopened" }))).toBe("In Review");
    expect(targetStatusFor(event({ action: "ready_for_review" }))).toBe(
      "In Review",
    );
  });

  it("leaves a draft PR alone", () => {
    expect(targetStatusFor(event({ draft: true }))).toBeNull();
  });

  it("moves a merged PR to Done and ignores a closed unmerged one", () => {
    expect(targetStatusFor(event({ action: "closed", merged: true }))).toBe(
      "Done",
    );
    expect(targetStatusFor(event({ action: "closed" }))).toBeNull();
  });

  it("moves nothing for the release PR from stag", () => {
    expect(
      targetStatusFor(
        event({ action: "closed", merged: true, headRef: "stag" }),
      ),
    ).toBeNull();
    expect(targetStatusFor(event({ headRef: "stag" }))).toBeNull();
  });

  it("ignores other actions", () => {
    expect(targetStatusFor(event({ action: "synchronize" }))).toBeNull();
  });
});

describe("pickTransition", () => {
  const transitions = [
    { id: "11", to: { name: "To Do" } },
    { id: "31", to: { name: "In Review" } },
    { id: "41", to: { name: "Done" } },
  ];

  it("finds the transition into the target status, ignoring case", () => {
    expect(pickTransition(transitions, "in review")?.id).toBe("31");
  });

  it("returns null when no transition reaches the status", () => {
    expect(pickTransition(transitions, "Blocked")).toBeNull();
  });
});
