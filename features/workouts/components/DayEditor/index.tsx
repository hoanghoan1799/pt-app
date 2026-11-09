"use client";

import { Copy, Dumbbell, Pencil, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  BUTTON_PRIMARY,
  ICON_BUTTON,
  PAGE_CONTAINER,
} from "@/constants/styles";
import { CopyWorkoutDaySheet } from "@/features/workouts/components/CopyWorkoutDaySheet";
import { DayHeading } from "@/features/workouts/components/DayHeading";
import { DayInfoForm } from "@/features/workouts/components/DayInfoForm";
import { ExerciseEditorItem } from "@/features/workouts/components/ExerciseEditorItem";
import { ExerciseForm } from "@/features/workouts/components/ExerciseForm";
import { RestDayState } from "@/features/workouts/components/RestDayState";
import { useDayEditor } from "@/features/workouts/hooks/use-day-editor";
import type { ScheduleDayWithSets } from "@/features/workouts/types/workout";
import { hasDayContent } from "@/features/workouts/utils/schedule";
import { formatFullDay } from "@/utils/week";

interface DayEditorProps {
  day: ScheduleDayWithSets;
  userId: number;
  isToday: boolean;
  // Today in the app time zone: earlier days can't receive a copy.
  today: string;
  // Dates with a workout / with logged sets in the loaded week.
  datesWithPlan: string[];
  datesWithLogs: string[];
}

export const DayEditor = ({
  day,
  userId,
  isToday,
  today,
  datesWithPlan,
  datesWithLogs,
}: DayEditorProps) => {
  const locale = useLocale();
  const t = useTranslations("workouts.dayEditor");
  const editor = useDayEditor();
  const [isCopyOpen, setIsCopyOpen] = useState(false);
  const { exercise } = editor.exerciseSheet;
  // Read from the live day so a set logged after the sheet opened still counts.
  const hasSets = day.exercises.some(
    (item) => item.id === exercise?.id && item.loggedSets.length > 0,
  );

  return (
    <section className="space-y-4">
      <DayHeading
        day={day}
        isToday={isToday}
        fallbackTitle={t("untitledDay")}
        action={
          <div className="-mr-2 flex items-center gap-2">
            {hasDayContent(day) && (
              <button
                type="button"
                onClick={() => setIsCopyOpen(true)}
                className={`${ICON_BUTTON} bg-surface text-fg ring-1 ring-line`}
                aria-label={t("copyDay")}
              >
                <Copy className="size-5" />
              </button>
            )}
            <button
              type="button"
              onClick={editor.handleOpenDaySheet}
              className={`${ICON_BUTTON} bg-surface text-fg ring-1 ring-line`}
              aria-label={t("editDayInfo")}
            >
              <Pencil className="size-5" />
            </button>
          </div>
        }
      />

      {day.exercises.length ? (
        <ol className="space-y-4">
          {day.exercises.map((item, index) => (
            <li key={item.id}>
              <ExerciseEditorItem
                exercise={item}
                index={index}
                count={day.exercises.length}
                userId={userId}
                onEdit={editor.handleEditExercise}
              />
            </li>
          ))}
        </ol>
      ) : (
        <RestDayState
          icon={Dumbbell}
          title={t("noExercisesTitle")}
          description={t("noExercisesDescription")}
        />
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur-xl">
        <div className={PAGE_CONTAINER}>
          <button
            type="button"
            onClick={editor.handleAddExercise}
            className={`${BUTTON_PRIMARY} w-full`}
          >
            <Plus className="size-5" aria-hidden />
            {t("addExercise", { date: formatFullDay(day.date, locale) })}
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={editor.exerciseSheet.isOpen}
        onOpenChange={editor.handleExerciseSheetChange}
        title={exercise ? t("editExerciseTitle") : t("addExerciseTitle")}
        description={formatFullDay(day.date, locale)}
      >
        <ExerciseForm
          key={editor.exerciseSheet.formKey}
          exercise={exercise}
          hasSets={hasSets}
          userId={userId}
          date={day.date}
          onSaved={editor.handleExerciseSaved}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={editor.isDaySheetOpen}
        onOpenChange={editor.handleDaySheetChange}
        title={t("dayInfoTitle")}
        description={formatFullDay(day.date, locale)}
      >
        <DayInfoForm
          day={day}
          userId={userId}
          onSaved={editor.handleDaySaved}
        />
      </BottomSheet>

      <CopyWorkoutDaySheet
        userId={userId}
        sourceDate={day.date}
        today={today}
        datesWithPlan={datesWithPlan}
        datesWithLogs={datesWithLogs}
        isOpen={isCopyOpen}
        onOpenChange={setIsCopyOpen}
      />
    </section>
  );
};
