"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { WORKOUT_MESSAGES } from "@/features/workouts/constants/messages";
import { setExerciseCompletionAction } from "@/features/workouts/services/completion-actions";
import type { Exercise } from "@/features/workouts/types/workout";
import { describeErrorReference } from "@/utils/errors";

// Flips the card to done/undone immediately; the server response (and its
// revalidated page) then confirms it or rolls it back.
export const useExerciseCompletion = (exercise: Exercise) => {
  const [completedAt, setOptimisticCompletedAt] = useOptimistic(
    exercise.completedAt,
  );
  const [isPending, startTransition] = useTransition();

  const handleToggle = () => {
    const isCompleting = completedAt === null;

    startTransition(async () => {
      setOptimisticCompletedAt(isCompleting ? Date.now() : null);

      const result = await setExerciseCompletionAction(
        exercise.id,
        isCompleting,
      );

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      if (isCompleting) {
        toast.success(WORKOUT_MESSAGES.COMPLETION_DONE);
      }
    });
  };

  return { completedAt, isPending, handleToggle };
};
