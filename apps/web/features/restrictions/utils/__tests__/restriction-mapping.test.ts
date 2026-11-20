import { describe, expect, it } from "vitest";

import {
  parseSuspensionDetails,
  toActiveRestriction,
} from "@/features/restrictions/utils/restriction-mapping";

describe("toActiveRestriction", () => {
  it("turns the API dates into epoch ms and keeps a permanent block open", () => {
    expect(
      toActiveRestriction({
        id: 3,
        level: "restricted",
        until: "2026-11-21T10:00:00.000Z",
        reason: "spam",
        createdAt: "2026-11-14T10:00:00.000Z",
      }),
    ).toEqual({
      id: 3,
      level: "restricted",
      until: Date.parse("2026-11-21T10:00:00.000Z"),
      reason: "spam",
      createdAt: Date.parse("2026-11-14T10:00:00.000Z"),
    });
    expect(
      toActiveRestriction({
        id: 3,
        level: "suspended",
        until: null,
        reason: "spam",
        createdAt: "2026-11-14T10:00:00.000Z",
      }).until,
    ).toBeNull();
  });
});

describe("parseSuspensionDetails", () => {
  it("reads a timed and a permanent suspension", () => {
    expect(
      parseSuspensionDetails({
        reason: "spam",
        permanent: false,
        until: "2026-11-21T10:00:00.000Z",
      }),
    ).toEqual({
      until: Date.parse("2026-11-21T10:00:00.000Z"),
      reason: "spam",
    });
    expect(parseSuspensionDetails({ reason: "spam", permanent: true })).toEqual(
      { until: null, reason: "spam" },
    );
  });

  it("is null for missing or malformed details", () => {
    expect(parseSuspensionDetails(undefined)).toBeNull();
    expect(parseSuspensionDetails({ permanent: true })).toBeNull();
    expect(
      parseSuspensionDetails({ reason: "x", permanent: false, until: "soon" }),
    ).toBeNull();
    expect(
      parseSuspensionDetails({ reason: "x", permanent: false }),
    ).toBeNull();
  });
});
