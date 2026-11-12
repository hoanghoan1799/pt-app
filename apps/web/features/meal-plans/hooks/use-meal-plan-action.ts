"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import type { ActionErrorResult } from "@/types/error";
import { describeErrorReference } from "@/utils/errors";

type Outcome = { status: string } | ActionErrorResult;

// Runs a meal plan server action: toasts the error (with its reference) or
// the success message, and tells the caller when it worked. The page data is
// refreshed by the action's revalidatePath.
export const useMealPlanAction = () => {
  const [isPending, startTransition] = useTransition();

  const run = <Result extends Outcome>(
    call: () => Promise<Result>,
    options: {
      successMessage?: string | ((result: Result) => string);
      onSuccess?: (result: Result) => void;
    } = {},
  ) => {
    startTransition(async () => {
      const result = await call();

      if (result.status === "error") {
        const { message, reference } = result as ActionErrorResult;

        toast.error(message, {
          description: describeErrorReference(reference),
        });
        return;
      }

      const { successMessage, onSuccess } = options;

      if (successMessage) {
        toast.success(
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage,
        );
      }
      onSuccess?.(result);
    });
  };

  return { isPending, run };
};
