import { addDays } from "@pt/contracts";

import { TIME_ZONE } from "@/constants/time";
import { getTodayDate } from "@/utils/week";

// Names and dates the e2e specs look up. The rows themselves are created through
// the API by api-seed*.ts; nothing here touches a database.

// Exercise titles the spec looks up by name.
export const E2E_EXERCISES = {
  BENCH: "E2E Bench press",
  SQUAT: "E2E Squat",
  ROWS: "E2E Row limit",
  PLANK: "E2E Plank",
  // Timed, but sets were logged before the PT made it timed (KAN-44).
  TIMED_LOGGED: "E2E Timed with sets",
  FUTURE: "E2E Future curl",
  // 4 planned sets, nothing logged: the partial-save test (KAN-50).
  PARTIAL: "E2E Partial sets",
} as const;

// Exercises of the PT specs (E2E_LIFTER_NAME). SQUAT beats last week (record),
// PRESS is logged for the first time, CURL has no sets, TEMP is deleted.
export const E2E_PT_EXERCISES = {
  SQUAT: "E2E PT Squat",
  PRESS: "E2E PT Press",
  CURL: "E2E PT Curl",
  // No sets; the delete test removes it.
  TEMP: "E2E PT Temp",
  // Has sets; the link-change test (KAN-39) replaces its video.
  LINK: "E2E PT Link",
  // No sets when seeded; the stale-page delete test (KAN-51) logs one itself.
  STALE: "E2E PT Stale",
} as const;

// Foods of the food library specs (KAN-65). Values are per 100 g.
export const E2E_FOODS = {
  CHICKEN: "Ức gà (chín)",
  CHICKEN_RAW: "Ức gà (sống)",
  RICE: "Cơm trắng (chín)",
  SALMON: "Cá hồi (chín)",
  // Meal plan specs (KAN-69): the spec's worked example and fat suggestions.
  BROCCOLI: "Bông cải xanh (luộc)",
  OLIVE_OIL: "Dầu ô liu",
  ALMOND: "Hạnh nhân",
} as const;

// The video the link-change test switches to.
export const E2E_NEW_VIDEO_ID = "dQw4w9WgXcQ";

// Dates are relative to the run date: only today and past days are loggable.
export const getE2eDates = (now = new Date()) => {
  const today = getTodayDate(TIME_ZONE, now);

  return {
    today,
    previous: addDays(today, -7),
    future: addDays(today, 1),
  };
};
