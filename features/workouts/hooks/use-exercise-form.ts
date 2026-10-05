"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";
import { toast } from "sonner";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveExerciseAction } from "@/features/workouts/services/workout-actions";
import type { Exercise } from "@/features/workouts/types/workout";
import {
  getYoutubeWatchUrl,
  parseYoutubeId,
} from "@/features/workouts/utils/youtube";
import { useFormFeedback } from "@/hooks/use-form-feedback";

interface UseExerciseFormOptions {
  exercise: Exercise | null;
  onSaved: () => void;
}

export const useExerciseForm = ({
  exercise,
  onSaved,
}: UseExerciseFormOptions) => {
  const [state, formAction, isPending] = useActionState(
    saveExerciseAction,
    INITIAL_FORM_STATE,
  );
  const [youtubeUrl, setYoutubeUrl] = useState(
    exercise ? getYoutubeWatchUrl(exercise.youtubeId) : "",
  );
  const youtubeId = parseYoutubeId(youtubeUrl);

  useFormFeedback(state, onSaved);

  // Submitted through a transition instead of <form action> so React doesn't
  // reset the fields when the server returns validation errors.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(() => formAction(formData));
  };

  const handlePaste = async () => {
    try {
      setYoutubeUrl(await navigator.clipboard.readText());
    } catch {
      toast.error("Không đọc được clipboard. Hãy dán thủ công.");
    }
  };

  return {
    youtubeUrl,
    youtubeId,
    hasInvalidUrl: youtubeUrl.trim() !== "" && !youtubeId,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
    isPending,
    setYoutubeUrl,
    handleSubmit,
    handlePaste,
  };
};
