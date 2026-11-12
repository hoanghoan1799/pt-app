import type {
  ActivityItem,
  PersonalBestActivity,
} from "@/features/dashboard/types/dashboard";
import {
  getBestSet,
  isPersonalBest,
  isSameExerciseBefore,
  type SetSession,
  toBestSet,
} from "@/features/workouts/utils/sets";

// One exercise with logged sets inside the activity window.
export interface ActivitySession extends SetSession {
  userName: string;
  exerciseTitle: string;
  // Epoch ms of the session's latest saved set.
  occurredAt: number;
}

// Window sessions whose sets are a personal best against `history` (D6, D8,
// D11). `history` may hold extra sessions (other users, links or later dates,
// even the window itself): only the same user + link on earlier dates count.
export const findPersonalBests = (
  window: ActivitySession[],
  history: SetSession[],
): PersonalBestActivity[] =>
  window.flatMap((session) => {
    const key = {
      userId: session.userId,
      youtubeId: session.youtubeId,
      date: session.date,
    };
    // Filtered once, so the history is scanned once per window session.
    const earlier = history.filter((item) => isSameExerciseBefore(item, key));
    const best = getBestSet(session.sets);
    const previousBest = getBestSet(earlier.flatMap((item) => item.sets));

    if (
      best === null ||
      previousBest === null ||
      !isPersonalBest(session.sets, earlier, key)
    ) {
      return [];
    }

    return [
      {
        kind: "personalBest",
        id: session.exerciseId,
        userId: session.userId,
        userName: session.userName,
        exerciseTitle: session.exerciseTitle,
        date: session.date,
        occurredAt: session.occurredAt,
        best: toBestSet(best),
        previousBest: toBestSet(previousBest),
      },
    ];
  });

// Newest first, at most `limit` items; on an exact tie a record comes first.
// Sets are stamped in whole seconds and the completion a few ms later, so a
// record usually sits just below the completion saved with it (F7).
export const mergeActivity = (
  completions: ActivityItem[],
  records: ActivityItem[],
  limit: number,
): ActivityItem[] =>
  [...records, ...completions]
    .sort((a, b) => b.occurredAt - a.occurredAt)
    .slice(0, limit);
