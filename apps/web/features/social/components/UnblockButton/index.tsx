"use client";

import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_SECONDARY } from "@/constants/styles";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { unblockUserAction } from "@/features/social/services/friend-actions";

export const UnblockButton = ({ userId }: { userId: number }) => {
  const t = useTranslations("social.unblock");
  const { isPending, run } = useSocialAction();

  return (
    <button
      type="button"
      disabled={isPending}
      aria-busy={isPending}
      onClick={() =>
        run(() => unblockUserAction(userId), {
          successMessage: t("success"),
        })
      }
      className={`${BUTTON_SECONDARY} min-h-11 px-4 text-sm`}
    >
      {isPending && <Spinner size="sm" />}
      {t("label")}
    </button>
  );
};
