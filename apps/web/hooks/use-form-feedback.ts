"use client";

import { useEffect, useEffectEvent } from "react";
import { toast } from "sonner";

import type { FormState } from "@/types/form";
import { describeErrorReference } from "@/utils/errors";

// Toasts the message of each form response and runs `onSuccess` once per
// successful submit.
export const useFormFeedback = (state: FormState, onSuccess?: () => void) => {
  const handleResponse = useEffectEvent((response: FormState) => {
    if (response.status === "success") {
      if (response.message) {
        toast.success(response.message);
      }
      onSuccess?.();
    }

    if (response.status === "error" && response.message) {
      toast.error(response.message, {
        description: describeErrorReference(response.errorReference),
      });
    }
  });

  useEffect(() => {
    handleResponse(state);
  }, [state]);
};
