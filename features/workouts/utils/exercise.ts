import { getFormatTranslator } from "@/i18n/format-translator";
import { DEFAULT_LOCALE, type Locale } from "@/utils/locale";

// "4 hiệp × 10-12", "4 hiệp", "10-12" or "" depending on what was filled in.
export const formatVolume = (
  sets: number | null,
  reps: string,
  locale: Locale = DEFAULT_LOCALE,
) => {
  const parts = [
    sets ? getFormatTranslator(locale)("volume.sets", { count: sets }) : "",
    reps.trim(),
  ].filter(Boolean);

  return parts.join(" × ");
};

// Timed exercises have no set logging in v1 (Q3, E4): a number followed by a
// time unit ("30s", "45 sec", "1 phút", "30 seconds", "1 minute", "1'", "30\"", "1p30", "30s mỗi bên").
// Unaccented spellings and the curly quotes phone keyboards insert count too.
const TIMED_REPS =
  /\d\s*(?:seconds?|minutes?|giây|giay|phút|phut|secs?|mins?|ph|p|s|['"’”′″])(?!\p{L})/u;

export const isTimedReps = (reps: string) =>
  TIMED_REPS.test(reps.normalize("NFC").toLowerCase());

// OQ1: a new link starts a new history, so the PT confirms before the
// trainee's logged sets are deleted. Only the video id counts, not the URL form.
export const shouldConfirmLinkChange = (
  oldId: string,
  newId: string | null,
  hasSets: boolean,
) => hasSets && newId !== null && newId !== oldId;

// OQ1: the PT is told the trainee's logged sets go with the exercise.
export const getDeleteConfirmMessage = (
  hasSets: boolean,
  locale: Locale = DEFAULT_LOCALE,
) =>
  getFormatTranslator(locale)(
    hasSets ? "deleteExercise.withSets" : "deleteExercise.plain",
  );
