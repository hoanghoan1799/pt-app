"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { describeErrorReference } from "@/utils/errors";

interface ActionResult {
  status: string;
  message?: string;
  reference?: string;
}

// Runs a server action from an event handler: shows the error toast, refreshes
// the page on success, and reports whether it worked.
export const useSocialAction = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const run = (
    action: () => Promise<ActionResult>,
    options: { successMessage?: string; onSuccess?: () => void } = {},
  ) => {
    startTransition(async () => {
      const result = await action();

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      if (options.successMessage) {
        toast.success(options.successMessage);
      }
      options.onSuccess?.();
      router.refresh();
    });
  };

  return { isPending, run };
};
