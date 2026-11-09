"use client";

import { useTranslations } from "next-intl";

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
      onClick={() =>
        run(() => unblockUserAction(userId), {
          successMessage: t("success"),
        })
      }
      className={`${BUTTON_SECONDARY} min-h-11 px-4 text-sm`}
    >
      {t("label")}
    </button>
  );
};
