"use client";

import { CompletionToggle } from "@/features/workouts/components/CompletionToggle";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { useExerciseCompletion } from "@/features/workouts/hooks/use-exercise-completion";
import type { Exercise } from "@/features/workouts/types/workout";

interface UserExerciseItemProps {
  exercise: Exercise;
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
      footer={
        <CompletionToggle
          completedAt={completedAt}
          canComplete={canComplete}
          isPending={isPending}
          onToggle={handleToggle}
        />
      }
    />
  );
};
