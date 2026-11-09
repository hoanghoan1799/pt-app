"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import {
  deleteExerciseAction,
  moveExerciseAction,
} from "@/features/workouts/services/workout-actions";
import type { MoveDirection } from "@/features/workouts/types/workout";
import { getDeleteConfirmMessage } from "@/features/workouts/utils/exercise";
import { describeErrorReference } from "@/utils/errors";

export const useExerciseItemActions = (
  exerciseId: number,
  userId: number,
  hasSets: boolean,
) => {
  const t = useTranslations("workouts.exerciseItemActions");
  const confirm = useConfirm();
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

  const confirmDelete = (withSets: boolean) =>
    confirm({
      title: getDeleteConfirmMessage(withSets),
      confirmLabel: t("deleteConfirmLabel"),
      isDanger: true,
    });

  const handleDelete = async () => {
    if (!(await confirmDelete(hasSets))) {
      return;
    }

    startTransition(async () => {
      let result = await deleteExerciseAction(exerciseId, userId, {
        confirmDeleteSets: hasSets,
      });

      // Sets were logged after this page loaded: the server changed nothing
      // and refreshed the page, so only the warning is missing.
      if (result.status === "needs-confirm") {
        if (!(await confirmDelete(true))) {
          return;
        }
        result = await deleteExerciseAction(exerciseId, userId, {
          confirmDeleteSets: true,
        });
      }

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      if (result.status === "success") {
        toast.success(t("deleted"));
      }
    });
  };

  return { isPending, handleMove, handleDelete };
};
