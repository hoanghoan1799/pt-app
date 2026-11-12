import { parseDecimal } from "@pt/contracts";

import { formatDecimal } from "@/features/nutrition/utils/energy";
import {
  SET_LIMITS,
  WORKOUT_MESSAGES,
} from "@/features/workouts/constants/messages";
import {
  describeMissingReps,
  describeRowError,
} from "@/features/workouts/constants/set-logger";
import type { Exercise } from "@/features/workouts/types/workout";
import { isTimedReps } from "@/features/workouts/utils/exercise";
import {
  type LoggedSet,
  type SetInput,
  setInputSchema,
} from "@/features/workouts/utils/sets";
import { getFormatTranslator } from "@/i18n/format-translator";
import { localizeMessageFor } from "@/i18n/localize-message";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// One editable row of the set logger. Inputs stay strings while typing so a
// half-typed "42," is not lost; `id` is a stable React key.
export interface SetRowDraft {
  id: number;
  weight: string;
  reps: string;
}

export type SetRowField = "weight" | "reps";

export type RowsParseResult =
  { ok: true; sets: SetInput[] } | { ok: false; message: string };

const toDraft = (set: LoggedSet | null, id: number): SetRowDraft => ({
  id,
  weight: !set || set.weightKg === null ? "" : formatDecimal(set.weightKg),
  reps: set ? String(set.reps) : "",
});

// Row n's hint is the previous session's set n (E7); rows past the previous
// count have none.
export const getRowHint = (
  previousSets: LoggedSet[],
  index: number,
): LoggedSet | null => previousSets[index] ?? null;

// The weight and reps strings a tapped hint writes into a row; a bodyweight
// hint leaves the weight empty (Q3).
export const hintToDraftValues = (
  hint: LoggedSet,
): Pick<SetRowDraft, "weight" | "reps"> => {
  const { weight, reps } = toDraft(hint, 0);

  return { weight, reps };
};

// Saved sets come first, then empty rows up to the planned count (1 when the PT
// left `sets` empty), so saving set 1 between sets keeps rows 2-4 and their
// hints (E1, Q1). Never more than the row limit (Q14).
export const createInitialRows = (
  loggedSets: LoggedSet[],
  plannedSets: number | null,
): SetRowDraft[] => {
  const saved = loggedSets.slice(0, SET_LIMITS.MAX_ROWS);
  const count = Math.min(
    Math.max(saved.length, plannedSets ?? 1, 1),
    SET_LIMITS.MAX_ROWS,
  );

  return Array.from({ length: count }, (_, index) =>
    toDraft(saved[index] ?? null, index),
  );
};

// An all-blank first save would store nothing yet toast success; clearing
// already saved sets with blank rows stays allowed (D2).
export const isEmptyFirstSave = (
  parsedSetsCount: number,
  loggedSetsCount: number,
) => parsedSetsCount === 0 && loggedSetsCount === 0;

// Weights are read with parseDecimal (utils/decimal.ts); the range and step
// checks stay in the schema. Reps keep the strict form ("8.5" still reaches the schema's integer message)
// but take no leading or trailing separator.
const parseReps = (value: string) =>
  /^\d+([.,]\d+)?$/.test(value) ? Number(value.replace(",", ".")) : Number.NaN;

// Turns the rows into the action's input. Fully blank rows are dropped, an
// empty weight is bodyweight (Q3). Each row is checked with the server's
// schema so the toast names the row before any round trip; the action still
// validates on its own.
export const rowsToSetInputs = (
  rows: SetRowDraft[],
  locale: Locale = DEFAULT_LOCALE,
): RowsParseResult => {
  const sets: SetInput[] = [];

  for (const [index, row] of rows.entries()) {
    const setNumber = index + 1;
    const weight = row.weight.trim();
    const reps = row.reps.trim();

    if (weight === "" && reps === "") {
      continue;
    }
    if (reps === "") {
      return { ok: false, message: describeMissingReps(setNumber, locale) };
    }

    const weightKg = weight === "" ? null : parseDecimal(weight);
    const repsCount = parseReps(reps);

    if (weightKg !== null && Number.isNaN(weightKg)) {
      return {
        ok: false,
        message: describeRowError(
          setNumber,
          WORKOUT_MESSAGES.SET_WEIGHT_RANGE,
          locale,
        ),
      };
    }
    if (Number.isNaN(repsCount)) {
      return {
        ok: false,
        message: describeRowError(
          setNumber,
          WORKOUT_MESSAGES.SET_REPS_RANGE,
          locale,
        ),
      };
    }

    const parsed = setInputSchema.safeParse({ weightKg, reps: repsCount });

    if (!parsed.success) {
      return {
        ok: false,
        message: describeRowError(
          setNumber,
          parsed.error.issues[0]?.message ?? WORKOUT_MESSAGES.INVALID_INPUT,
          locale,
        ),
      };
    }
    sets.push(parsed.data);
  }

  return sets.length > SET_LIMITS.MAX_ROWS
    ? {
        ok: false,
        message: localizeMessageFor(locale, WORKOUT_MESSAGES.SET_TOO_MANY),
      }
    : { ok: true, sets };
};

// "40 kg × 10", "42,5 kg × 8" or "Tự trọng × 12" ("42.5 kg × 8", "Bodyweight × 12").
export const formatSet = (
  { weightKg, reps }: LoggedSet,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const t = getFormatTranslator(locale);

  return `${weightKg === null ? t("weight.bodyweight") : `${formatDecimal(weightKg, locale)} ${t("weight.unit")}`} × ${reps}`;
};

// Set rows only on today's and past days (Q7) and never for timed exercises
// such as "30s" (Q3).
export const canLogSets = (exercise: Pick<Exercise, "reps">, isDue: boolean) =>
  isDue && !isTimedReps(exercise.reps);

// Timed exercises get no inputs (Q3), but sets already logged for one (e.g.
// before the PT changed its reps to "30s") stay visible read-only (KAN-44).
export const canShowLoggedSets = (
  exercise: Pick<Exercise, "reps">,
  loggedSetsCount: number,
) => isTimedReps(exercise.reps) && loggedSetsCount > 0;

// Changes whenever the saved sets change; used as the logger's React key.
export const getLoggedSetsKey = (sets: LoggedSet[]) =>
  sets.map((set) => `${set.weightKg ?? "bw"}x${set.reps}`).join("|");
