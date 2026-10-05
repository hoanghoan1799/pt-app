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

export const useExerciseItemActions = (exerciseId: number, userId: number) => {
  const [isPending, startTransition] = useTransition();

  const handleMove = (direction: MoveDirection) => {
    startTransition(() => moveExerciseAction(exerciseId, userId, direction));
  };

  const handleDelete = () => {
    if (!window.confirm(CONFIRM_MESSAGES.DELETE_EXERCISE)) {
      return;
    }

    startTransition(async () => {
      await deleteExerciseAction(exerciseId, userId);
      toast.success(WORKOUT_MESSAGES.EXERCISE_DELETED);
    });
  };

  return { isPending, handleMove, handleDelete };
};
