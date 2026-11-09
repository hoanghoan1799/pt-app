"use client";

import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/constants/styles";
import { SetInputRow } from "@/features/workouts/components/SetInputRow";
import { useExerciseSets } from "@/features/workouts/hooks/use-exercise-sets";
import type { ExerciseWithSets } from "@/features/workouts/types/workout";
import { getRowHint } from "@/features/workouts/utils/set-logger";

interface SetLoggerProps {
  exercise: ExerciseWithSets;
}

// Weight and reps per set on today's or a past exercise card (KAN-30). The
// caller hides it on future days and timed exercises.
export const SetLogger = ({ exercise }: SetLoggerProps) => {
  const t = useTranslations("workouts.setLogger");
  const {
    rows,
    canAdd,
    canRemove,
    isPending,
    addRow,
    removeRow,
    updateRow,
    applyHint,
    handleSave,
  } = useExerciseSets(exercise);

  return (
    <section
      aria-label={t("sectionLabel", { title: exercise.title })}
      className="space-y-3 border-t border-line px-4 py-4"
    >
      <div className="grid grid-cols-[1.75rem_1fr_1fr_2.75rem] gap-2 text-center text-xs font-semibold tracking-wide text-muted uppercase">
        <span>#</span>
        <span>{t("weightUnit")}</span>
        <span>{t("repsUnit")}</span>
        <span />
      </div>
      <ol className="space-y-2">
        {rows.map((row, index) => (
          <SetInputRow
            key={row.id}
            index={index}
            row={row}
            targetReps={exercise.reps}
            canRemove={canRemove}
            isDisabled={isPending}
            onChange={updateRow}
            onRemove={removeRow}
            hint={getRowHint(exercise.previousSets, index)}
            onApplyHint={applyHint}
          />
        ))}
      </ol>
      <p className="text-xs text-muted">{t("bodyweightHint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={addRow}
          disabled={!canAdd || isPending}
          className={BUTTON_SECONDARY}
        >
          <Plus className="size-5" aria-hidden />
          {t("addRow")}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          aria-busy={isPending}
          className={BUTTON_PRIMARY}
        >
          {isPending && <Spinner size="md" />}
          {isPending ? t("saving") : t("save")}
        </button>
      </div>
    </section>
  );
};
