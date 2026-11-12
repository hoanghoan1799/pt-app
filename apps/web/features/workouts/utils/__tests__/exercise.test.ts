import { parseYoutubeId } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { CONFIRM_MESSAGES } from "@/features/workouts/constants/messages";
import {
  formatVolume,
  getDeleteConfirmMessage,
  isTimedReps,
  shouldConfirmLinkChange,
} from "@/features/workouts/utils/exercise";

describe("formatVolume", () => {
  it("joins sets and reps", () => {
    expect(formatVolume(4, "10-12")).toBe("4 hiệp × 10-12");
  });

  it("handles missing parts", () => {
    expect(formatVolume(4, " ")).toBe("4 hiệp");
    expect(formatVolume(null, "30 giây")).toBe("30 giây");
    expect(formatVolume(null, "")).toBe("");
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

describe("getDeleteConfirmMessage", () => {
  it("warns that logged sets go too when the exercise has sets (OQ1)", () => {
    expect(getDeleteConfirmMessage(true)).toBe(
      CONFIRM_MESSAGES.DELETE_EXERCISE_WITH_SETS,
    );
  });

  it("keeps the plain message without sets", () => {
    expect(getDeleteConfirmMessage(false)).toBe("Xóa bài tập này?");
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
