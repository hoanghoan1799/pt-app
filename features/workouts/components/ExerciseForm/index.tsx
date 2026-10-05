"use client";

import { ExerciseFormView } from "@/features/workouts/components/ExerciseFormView";
import { useExerciseForm } from "@/features/workouts/hooks/use-exercise-form";
import type { Exercise } from "@/features/workouts/types/workout";

interface ExerciseFormProps {
  exercise: Exercise | null;
  userId: number;
  date: string;
  onSaved: () => void;
}

export const ExerciseForm = ({
  exercise,
  userId,
  date,
  onSaved,
}: ExerciseFormProps) => {
  const form = useExerciseForm({ exercise, onSaved });

  return (
    <ExerciseFormView
      exercise={exercise}
      userId={userId}
      date={date}
      youtubeUrl={form.youtubeUrl}
      youtubeId={form.youtubeId}
      hasInvalidUrl={form.hasInvalidUrl}
      fieldErrors={form.fieldErrors}
      isPending={form.isPending}
      onYoutubeUrlChange={form.setYoutubeUrl}
      onPaste={form.handlePaste}
      onSubmit={form.handleSubmit}
    />
  );
};
