"use client";

import { getYoutubeWatchUrl, parseYoutubeId } from "@pt/contracts";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { saveExerciseAction } from "@/features/workouts/services/workout-actions";
import type { Exercise } from "@/features/workouts/types/workout";
import { shouldConfirmLinkChange } from "@/features/workouts/utils/exercise";
import { useFormFeedback } from "@/hooks/use-form-feedback";

interface UseExerciseFormOptions {
  exercise: Exercise | null;
  hasSets: boolean;
  onSaved: () => void;
}

export const useExerciseForm = ({
  exercise,
  hasSets,
  onSaved,
}: UseExerciseFormOptions) => {
  const t = useTranslations("workouts.exerciseForm");
  const confirm = useConfirm();
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
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    // OQ1: the server decides whether sets exist; this only asks the PT first.
    if (
      exercise &&
      shouldConfirmLinkChange(exercise.youtubeId, youtubeId, hasSets)
    ) {
      const isConfirmed = await confirm({
        title: t("changeLinkConfirmTitle"),
        confirmLabel: t("continue"),
        isDanger: true,
      });

      if (!isConfirmed) {
        return;
      }
      formData.set("confirmResetSets", "true");
    }

    startTransition(() => formAction(formData));
  };

  const handlePaste = async () => {
    try {
      setYoutubeUrl(await navigator.clipboard.readText());
    } catch {
      toast.error(t("clipboardError"));
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
