"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY } from "@/constants/styles";
import { acceptTermsAction } from "@/features/social/services/social-actions";
import { describeErrorReference } from "@/utils/errors";

// "Đồng ý" stores the terms version and the time, then reloads the page.
export const TermsAcceptButton = () => {
  const t = useTranslations("social.terms");
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
      aria-busy={isPending}
      className={`${BUTTON_PRIMARY} w-full`}
    >
      {isPending && <Spinner size="md" />}
      {t("accept")}
    </button>
  );
};
