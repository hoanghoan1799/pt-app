"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { CONFIRM_MESSAGES } from "@/features/workouts/constants/messages";
import { copyWeekAction } from "@/features/workouts/services/workout-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const useCopyWeek = () => {
  const confirm = useConfirm();
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction] = useActionState(
    copyWeekAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state, () => setIsOpen(false));

  // The dialog answers later than the submit event, so the native submit is
  // always stopped and the form data is sent once the PT confirms.
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const isConfirmed = await confirm({
      title: CONFIRM_MESSAGES.COPY_WEEK,
      confirmLabel: "Sao chép",
      isDanger: true,
    });

    if (isConfirmed) {
      startTransition(() => formAction(formData));
    }
  };

  return { isOpen, setIsOpen, formAction, handleSubmit };
};
