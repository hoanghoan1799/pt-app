"use client";

import { CompletionToggle } from "@/features/workouts/components/CompletionToggle";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { LoggedSetList } from "@/features/workouts/components/LoggedSetList";
import { SetLogger } from "@/features/workouts/components/SetLogger";
import { useExerciseCompletion } from "@/features/workouts/hooks/use-exercise-completion";
import type { ExerciseWithSets } from "@/features/workouts/types/workout";
import {
  canLogSets,
  canShowLoggedSets,
  getLoggedSetsKey,
} from "@/features/workouts/utils/set-logger";

interface UserExerciseItemProps {
  exercise: ExerciseWithSets;
  index: number;
  canComplete: boolean;
}

export const UserExerciseItem = ({
  exercise,
  index,
  canComplete,
}: UserExerciseItemProps) => {
  const { completedAt, isPending, handleToggle } =
    useExerciseCompletion(exercise);

  return (
    <ExerciseCard
      exercise={{ ...exercise, completedAt }}
      index={index}
      isPersonalBest={exercise.isPersonalBest}
      footer={
        <>
          {canLogSets(exercise, canComplete) && (
            <SetLogger
              key={getLoggedSetsKey(exercise.loggedSets)}
              exercise={exercise}
            />
          )}
          {canShowLoggedSets(exercise, exercise.loggedSets.length) && (
            <LoggedSetList sets={exercise.loggedSets} />
          )}
          <CompletionToggle
            completedAt={completedAt}
            canComplete={canComplete}
            isPending={isPending}
            onToggle={handleToggle}
          />
        </>
      }
    />
  );
};
