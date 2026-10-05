"use client";

import clsx from "clsx";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";

import { ICON_BUTTON } from "@/constants/styles";
import { ExerciseCard } from "@/features/workouts/components/ExerciseCard";
import { useExerciseItemActions } from "@/features/workouts/hooks/use-exercise-item-actions";
import type { Exercise } from "@/features/workouts/types/workout";

interface ExerciseEditorItemProps {
  exercise: Exercise;
  index: number;
  count: number;
  userId: number;
  onEdit: (exercise: Exercise) => void;
}

const TOOL_BUTTON =
  "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition active:bg-line disabled:opacity-40";

export const ExerciseEditorItem = ({
  exercise,
  index,
  count,
  userId,
  onEdit,
}: ExerciseEditorItemProps) => {
  const { isPending, handleMove, handleDelete } = useExerciseItemActions(
    exercise.id,
    userId,
  );

  return (
    <div className={clsx("transition-opacity", isPending && "opacity-50")}>
      <ExerciseCard
        exercise={exercise}
        index={index}
        footer={
          <div className="flex items-center gap-1 border-t border-line px-2 py-1">
            <button
              type="button"
              onClick={() => handleMove("up")}
              disabled={isPending || index === 0}
              className={ICON_BUTTON}
              aria-label="Đưa lên"
            >
              <ArrowUp className="size-5" />
            </button>
            <button
              type="button"
              onClick={() => handleMove("down")}
              disabled={isPending || index === count - 1}
              className={ICON_BUTTON}
              aria-label="Đưa xuống"
            >
              <ArrowDown className="size-5" />
            </button>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => onEdit(exercise)}
              disabled={isPending}
              className={clsx(TOOL_BUTTON, "text-fg")}
            >
              <Pencil className="size-4" aria-hidden />
              Sửa
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className={clsx(TOOL_BUTTON, "text-danger")}
            >
              <Trash2 className="size-4" aria-hidden />
              Xóa
            </button>
          </div>
        }
      />
    </div>
  );
};
