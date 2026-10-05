"use client";

import { useState } from "react";

import type { Exercise } from "@/features/workouts/types/workout";

interface ExerciseSheetState {
  isOpen: boolean;
  exercise: Exercise | null;
  // Remounts the form on every open so "add" always starts empty.
  formKey: number;
}

export const useDayEditor = () => {
  const [exerciseSheet, setExerciseSheet] = useState<ExerciseSheetState>({
    isOpen: false,
    exercise: null,
    formKey: 0,
  });
  const [isDaySheetOpen, setIsDaySheetOpen] = useState(false);

  const openExerciseSheet = (exercise: Exercise | null) => {
    setExerciseSheet((previous) => ({
      isOpen: true,
      exercise,
      formKey: previous.formKey + 1,
    }));
  };

  // Keeps `exercise` while closing so the sheet content doesn't flash during
  // the slide-down animation.
  const handleExerciseSheetChange = (isOpen: boolean) => {
    setExerciseSheet((previous) => ({ ...previous, isOpen }));
  };

  return {
    exerciseSheet,
    isDaySheetOpen,
    handleAddExercise: () => openExerciseSheet(null),
    handleEditExercise: (exercise: Exercise) => openExerciseSheet(exercise),
    handleExerciseSheetChange,
    handleExerciseSaved: () => handleExerciseSheetChange(false),
    handleOpenDaySheet: () => setIsDaySheetOpen(true),
    handleDaySheetChange: setIsDaySheetOpen,
    handleDaySaved: () => setIsDaySheetOpen(false),
  };
};
