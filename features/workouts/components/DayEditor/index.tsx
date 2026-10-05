"use client";

import { Dumbbell, Pencil, Plus } from "lucide-react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  BUTTON_PRIMARY,
  ICON_BUTTON,
  PAGE_CONTAINER,
} from "@/constants/styles";
import { DayHeading } from "@/features/workouts/components/DayHeading";
import { DayInfoForm } from "@/features/workouts/components/DayInfoForm";
import { ExerciseEditorItem } from "@/features/workouts/components/ExerciseEditorItem";
import { ExerciseForm } from "@/features/workouts/components/ExerciseForm";
import { RestDayState } from "@/features/workouts/components/RestDayState";
import { useDayEditor } from "@/features/workouts/hooks/use-day-editor";
import type { ScheduleDay } from "@/features/workouts/types/workout";
import { formatFullDay } from "@/features/workouts/utils/week";

interface DayEditorProps {
  day: ScheduleDay;
  userId: number;
  isToday: boolean;
}

export const DayEditor = ({ day, userId, isToday }: DayEditorProps) => {
  const editor = useDayEditor();
  const { exercise } = editor.exerciseSheet;

  return (
    <section className="space-y-4">
      <DayHeading
        day={day}
        isToday={isToday}
        fallbackTitle="Chưa đặt tiêu đề"
        action={
          <button
            type="button"
            onClick={editor.handleOpenDaySheet}
            className={`${ICON_BUTTON} -mr-2 bg-surface text-fg ring-1 ring-line`}
            aria-label="Sửa tiêu đề và ghi chú ngày"
          >
            <Pencil className="size-5" />
          </button>
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
          title="Chưa có bài tập"
          description="Bấm “Thêm bài tập” để giao bài cho ngày này. Để trống thì user sẽ thấy là ngày nghỉ."
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
            Thêm bài tập · {formatFullDay(day.date)}
          </button>
        </div>
      </div>

      <BottomSheet
        isOpen={editor.exerciseSheet.isOpen}
        onOpenChange={editor.handleExerciseSheetChange}
        title={exercise ? "Sửa bài tập" : "Thêm bài tập"}
        description={formatFullDay(day.date)}
      >
        <ExerciseForm
          key={editor.exerciseSheet.formKey}
          exercise={exercise}
          userId={userId}
          date={day.date}
          onSaved={editor.handleExerciseSaved}
        />
      </BottomSheet>

      <BottomSheet
        isOpen={editor.isDaySheetOpen}
        onOpenChange={editor.handleDaySheetChange}
        title="Thông tin ngày"
        description={formatFullDay(day.date)}
      >
        <DayInfoForm
          day={day}
          userId={userId}
          onSaved={editor.handleDaySaved}
        />
      </BottomSheet>
    </section>
  );
};
