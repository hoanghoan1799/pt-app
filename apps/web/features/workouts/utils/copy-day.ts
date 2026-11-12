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
