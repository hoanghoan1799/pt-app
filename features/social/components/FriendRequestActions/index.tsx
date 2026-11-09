"use client";

import { useTranslations } from "next-intl";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/constants/styles";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
} from "@/features/social/services/friend-actions";

interface FriendRequestActionsProps {
  userId: number;
  // received: Chấp nhận / Từ chối; sent: Huỷ lời mời.
  direction: "received" | "sent";
}

const SMALL = "min-h-11 px-4 text-sm";

export const FriendRequestActions = ({
  userId,
  direction,
}: FriendRequestActionsProps) => {
  const t = useTranslations("social.friendRequest");
  const { isPending, run } = useSocialAction();

  if (direction === "sent") {
    return (
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => run(() => cancelFriendRequestAction(userId))}
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        {isPending && <Spinner size="sm" />}
        {t("cancel")}
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => run(() => acceptFriendRequestAction(userId))}
        className={`${BUTTON_PRIMARY} ${SMALL}`}
      >
        {isPending && <Spinner size="sm" />}
        {t("accept")}
      </button>
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => run(() => declineFriendRequestAction(userId))}
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        {isPending && <Spinner size="sm" />}
        {t("decline")}
      </button>
    </div>
  );
};
