"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  CONFIRM_MESSAGES,
  WORKOUT_MESSAGES,
} from "@/features/workouts/constants/messages";
import {
  deleteExerciseAction,
  moveExerciseAction,
} from "@/features/workouts/services/workout-actions";
import type { MoveDirection } from "@/features/workouts/types/workout";
import { describeErrorReference } from "@/utils/errors";

export const useExerciseItemActions = (exerciseId: number, userId: number) => {
  const [isPending, startTransition] = useTransition();

  const handleMove = (direction: MoveDirection) => {
    startTransition(async () => {
      const result = await moveExerciseAction(exerciseId, userId, direction);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
      }
    });
  };

  const handleDelete = () => {
    if (!window.confirm(CONFIRM_MESSAGES.DELETE_EXERCISE)) {
      return;
    }

    startTransition(async () => {
      const result = await deleteExerciseAction(exerciseId, userId);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      toast.success(WORKOUT_MESSAGES.EXERCISE_DELETED);
    });
  };

  return { isPending, handleMove, handleDelete };
};
