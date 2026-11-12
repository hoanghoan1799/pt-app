// Best set and session history (KAN-26). Pure functions: records are computed
// on read (D8), nothing here touches the database. Ported from
// apps/web/features/workouts/utils/{sets,set-rows,week-sets}.ts.

export type LoggedSet = { weightKg: number | null; reps: number };

// A best set always has a weight: bodyweight sets never count (OQ2).
export type BestSet = { weightKg: number; reps: number };

// One exercise's logged sets on one day. Dates are YYYY-MM-DD strings, so plain
// string comparison orders them correctly.
export type SetSession = {
  userId: number;
  youtubeId: string;
  date: string;
  exerciseId: number;
  sets: LoggedSet[];
};

// True when both lists hold the same sets in the same order (position is the
// index). Weight null (bodyweight) only equals null. Weights compare with
// `===`, which is exact because they are 0.5 steps (D3).
export const areSetsEqual = (a: LoggedSet[], b: LoggedSet[]): boolean =>
  a.length === b.length &&
  a.every(
    (set, index) =>
      set.weightKg === b[index].weightKg && set.reps === b[index].reps,
  );

// "Same exercise" means same user + same youtubeId (Q6), seen from `date`.
export type SessionKey = { userId: number; youtubeId: string; date: string };

type WeightedSet = LoggedSet & { weightKg: number };

const isWeighted = (set: LoggedSet): set is WeightedSet =>
  set.weightKg !== null;

// Heavier weight wins; on equal weight, more reps wins (Q8).
export const compareSets = (a: WeightedSet, b: WeightedSet): number =>
  a.weightKg !== b.weightKg ? a.weightKg - b.weightKg : a.reps - b.reps;

// Bodyweight sets never count (OQ2). An exact tie keeps the first set.
export const getBestSet = <T extends LoggedSet>(
  sets: T[],
): (T & WeightedSet) | null => {
  let best: (T & WeightedSet) | null = null;

  for (const set of sets) {
    if (isWeighted(set) && (best === null || compareSets(set, best) > 0)) {
      best = set;
    }
  }

  return best;
};

// Plain { weightKg, reps } copy of a best set, without the row's other fields.
export const toBestSet = (set: WeightedSet): BestSet => ({
  weightKg: set.weightKg,
  reps: set.reps,
});

export const isSameExerciseBefore = (session: SetSession, key: SessionKey) =>
  session.userId === key.userId &&
  session.youtubeId === key.youtubeId &&
  session.date < key.date;

// True only when the new best beats every earlier weighted set of the same
// user + youtubeId on strictly earlier dates (D6, D7). A tie is not a record,
// and the first-ever weighted set is not a record either (D11).
export const isPersonalBest = (
  newSets: LoggedSet[],
  history: SetSession[],
  key: SessionKey,
): boolean => {
  const newBest = getBestSet(newSets);

  if (newBest === null) {
    return false;
  }

  const earlierBest = getBestSet(
    history
      .filter((session) => isSameExerciseBefore(session, key))
      .flatMap((session) => session.sets),
  );

  if (earlierBest === null) {
    return false;
  }

  return compareSets(newBest, earlierBest) > 0;
};

// Latest session of the same user + youtubeId on a strictly earlier date (D7).
// When the link appears twice on that date, the lowest exerciseId wins.
export const getPreviousSession = (
  history: SetSession[],
  key: SessionKey,
): SetSession | null => {
  let previous: SetSession | null = null;

  for (const session of history) {
    if (session.sets.length === 0 || !isSameExerciseBefore(session, key)) {
      continue;
    }

    if (
      previous === null ||
      session.date > previous.date ||
      (session.date === previous.date &&
        session.exerciseId < previous.exerciseId)
    ) {
      previous = session;
    }
  }

  return previous;
};

// A flat query row: one logged set plus whatever the caller joined to it.
export type SetRow = LoggedSet & { exerciseId: number; position: number };

export type GroupedSetRow<R extends SetRow> = Omit<
  R,
  "weightKg" | "reps" | "position"
> & { sets: LoggedSet[] };

// Groups flat set rows into one entry per exercise, in first-seen order. The
// first row of an exercise supplies the joined fields; its sets are ordered by
// position regardless of the order the query returned them in.
export const groupSetRows = <R extends SetRow>(
  rows: R[],
): GroupedSetRow<R>[] => {
  const byExercise = new Map<number, R[]>();

  for (const row of rows) {
    const group = byExercise.get(row.exerciseId);

    if (group) {
      group.push(row);
    } else {
      byExercise.set(row.exerciseId, [row]);
    }
  }

  return [...byExercise.values()].map((group) => {
    const { weightKg, reps, position, ...joined } = group[0];

    void weightKg;
    void reps;
    void position;

    return {
      ...joined,
      sets: [...group]
        .sort((a, b) => a.position - b.position)
        .map((row) => ({ weightKg: row.weightKg, reps: row.reps })),
    };
  });
};

export type ScheduleExercise = {
  id: number;
  title: string;
  description: string;
  sets: number | null;
  reps: string;
  youtubeId: string;
  position: number;
  completedAt: Date | null;
};

export type ScheduleDay = {
  date: string;
  title: string;
  note: string;
  exercises: ScheduleExercise[];
};

export type ExerciseWithSets = ScheduleExercise & {
  loggedSets: LoggedSet[];
  previousSets: LoggedSet[];
  isPersonalBest: boolean;
};

export type ScheduleDayWithSets = Omit<ScheduleDay, "exercises"> & {
  exercises: ExerciseWithSets[];
};

// Attaches each exercise's own sets, the previous session's sets (hints by row
// position, E7) and the record flag (E6) to a schedule.
export const attachSetsToWeek = (
  days: ScheduleDay[],
  userId: number,
  sessions: SetSession[],
): ScheduleDayWithSets[] => {
  const byExercise = new Map(
    sessions.map((session) => [session.exerciseId, session]),
  );

  return days.map((day) => ({
    ...day,
    exercises: day.exercises.map((exercise) => {
      const key = { userId, youtubeId: exercise.youtubeId, date: day.date };
      const loggedSets = byExercise.get(exercise.id)?.sets ?? [];

      return {
        ...exercise,
        loggedSets,
        previousSets: getPreviousSession(sessions, key)?.sets ?? [],
        isPersonalBest: isPersonalBest(loggedSets, sessions, key),
      };
    }),
  }));
};
