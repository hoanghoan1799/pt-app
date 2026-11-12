// Timed exercises have no set logging (Q3, E4): a number followed by a time
// unit ("30s", "45 sec", "1 phút", "30 seconds", "1'", "1p30", "30s mỗi bên").
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

// A day has content when it has a title, a note or at least one exercise.
export const hasDayContent = (day: {
  title: string;
  note: string;
  exercises: unknown[];
}) => Boolean(day.title || day.note || day.exercises.length);

interface NormalizeCopyTargetsOptions {
  sourceDate: string;
  dates: string[];
  // Today in the app time zone.
  today: string;
}

// The dates a day copy writes to: duplicates and the source date are dropped
// (order kept). `hasPast` tells that a date before today was asked for, which
// rejects the whole request.
export const normalizeCopyTargets = ({
  sourceDate,
  dates,
  today,
}: NormalizeCopyTargetsOptions) => {
  const targets = [...new Set(dates)].filter((date) => date !== sourceDate);

  return {
    dates: targets,
    hasPast: targets.some((date) => date < today),
  };
};
