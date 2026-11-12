import type { LoggedSet } from "@/features/workouts/utils/sets";

// A flat query row: one logged set plus whatever the caller joined to it.
export interface SetRow extends LoggedSet {
  exerciseId: number;
  position: number;
}

export type GroupedSetRow<R extends SetRow> = Omit<
  R,
  "weightKg" | "reps" | "position"
> & {
  sets: LoggedSet[];
};

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
