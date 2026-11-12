import { parseYoutubeId } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { hasDayContent, isTimedReps, normalizeCopyTargets, shouldConfirmLinkChange } from "./exercise-rules.js";

const today = "2026-11-09";

describe("normalizeCopyTargets", () => {
  it("drops duplicates and the source date, keeping the order", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-12", "2026-11-10", "2026-11-11", "2026-11-12"],
        today,
      }),
    ).toEqual({ dates: ["2026-11-12", "2026-11-11"], hasPast: false });
  });

  it("flags a date before today but accepts today itself", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-09"],
        today,
      }).hasPast,
    ).toBe(false);
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-11", "2026-11-08"],
        today,
      }).hasPast,
    ).toBe(true);
  });

  it("returns no dates when only the source was asked for", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-10",
        dates: ["2026-11-10"],
        today,
      }),
    ).toEqual({ dates: [], hasPast: false });
  });

  it("does not count a dropped source in the past as a past target", () => {
    expect(
      normalizeCopyTargets({
        sourceDate: "2026-11-01",
        dates: ["2026-11-01", "2026-11-12"],
        today,
      }),
    ).toEqual({ dates: ["2026-11-12"], hasPast: false });
  });
});

describe("isTimedReps", () => {
  it.each(["30s", "45 sec", "30 giây", "1p", "2ph", "1 phút", "1'", '30"'])(
    "treats %s as timed",
    (reps) => {
      expect(isTimedReps(reps)).toBe(true);
    },
  );

  it.each([
    "30-45s",
    " 30S ",
    "1 Phút",
    "1 phut",
    "30 giay",
    "60 secs",
    "2 min",
    "1’",
    "30”",
    "1p30",
    "30s mỗi bên",
    "45s/side",
    "30 seconds",
    "1 minute",
    "2 mins",
    "45 secs",
  ])("treats %s as timed", (reps) => {
    expect(isTimedReps(reps)).toBe(true);
  });

  it.each([
    "12",
    "8-12",
    "10",
    "",
    "10 reps",
    "tối đa",
    "3 sets",
    "12 mỗi bên",
  ])("treats %s as counted reps", (reps) => {
    expect(isTimedReps(reps)).toBe(false);
  });
});


describe("shouldConfirmLinkChange", () => {
  const OLD_ID = "dQw4w9WgXcQ";
  const NEW_ID = "9bZkp7q19f0";

  it("does not ask when the video id is unchanged", () => {
    expect(shouldConfirmLinkChange(OLD_ID, OLD_ID, true)).toBe(false);
  });

  it("asks when the video changes and the exercise has sets (OQ1)", () => {
    expect(shouldConfirmLinkChange(OLD_ID, NEW_ID, true)).toBe(true);
  });

  it("does not ask when the video changes but there are no sets", () => {
    expect(shouldConfirmLinkChange(OLD_ID, NEW_ID, false)).toBe(false);
  });

  it("compares video ids, so another URL form of the same video is no change", () => {
    const newId = parseYoutubeId(`https://youtu.be/${OLD_ID}?t=30`);

    expect(shouldConfirmLinkChange(OLD_ID, newId, true)).toBe(false);
  });

  it("does not ask for an unparsable link (validation reports it)", () => {
    expect(shouldConfirmLinkChange(OLD_ID, null, true)).toBe(false);
  });
});

describe("hasDayContent", () => {
  const empty = { title: "", note: "", exercises: [] };

  it("is false for an empty day", () => {
    expect(hasDayContent(empty)).toBe(false);
  });

  it.each([{ title: "Push" }, { note: "Rest well" }, { exercises: [1] }])(
    "is true with %j",
    (patch) => {
      expect(hasDayContent({ ...empty, ...patch })).toBe(true);
    },
  );
});
