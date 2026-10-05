"use client";

import { type FormEvent, useActionState, useState } from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import { CONFIRM_MESSAGES } from "@/features/workouts/constants/messages";
import { copyWeekAction } from "@/features/workouts/services/workout-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useCopyWeek = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    copyWeekAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state, () => setIsOpen(false));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (!window.confirm(CONFIRM_MESSAGES.COPY_WEEK)) {
      event.preventDefault();
    }
  };

  return { isOpen, setIsOpen, formAction, handleSubmit };
};
