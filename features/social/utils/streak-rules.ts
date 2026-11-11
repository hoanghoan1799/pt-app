import { addDays } from "@/utils/week";

// Consecutive "YYYY-MM-DD" dates with a completion, counting back from today.
// A day without training yet does not break the streak: with none today it
// starts from yesterday. Duplicates and order in `dates` do not matter.
export const computeDayStreak = (dates: readonly string[], today: string) => {
  const trained = new Set(dates);
  let cursor = trained.has(today) ? today : addDays(today, -1);
  let streak = 0;

  while (trained.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

// Who sees a trainee's training stats: the owner, an accepted friend, any
// admin viewer (the admin page already scoped access to the trainee).
export const canViewTrainingStats = (viewer: {
  isOwn: boolean;
  isAdminViewer: boolean;
  relationship: string | null;
}) => viewer.isOwn || viewer.isAdminViewer || viewer.relationship === "friends";
