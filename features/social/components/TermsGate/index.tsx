"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { BUTTON_PRIMARY } from "@/constants/styles";
import { acceptTermsAction } from "@/features/social/services/social-actions";
import { describeErrorReference } from "@/utils/errors";

// "Đồng ý" stores the terms version and the time, then reloads the page.
export const TermsAcceptButton = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAccept = () => {
    startTransition(async () => {
      const result = await acceptTermsAction();

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleAccept}
      disabled={isPending}
      className={`${BUTTON_PRIMARY} w-full`}
    >
      {isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
      Đồng ý
    </button>
  );
};
