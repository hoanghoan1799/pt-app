"use client";

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
  const { isPending, run } = useSocialAction();

  if (direction === "sent") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => cancelFriendRequestAction(userId))}
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        Huỷ lời mời
      </button>
    );
  }
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => acceptFriendRequestAction(userId))}
        className={`${BUTTON_PRIMARY} ${SMALL}`}
      >
        Chấp nhận
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => declineFriendRequestAction(userId))}
        className={`${BUTTON_SECONDARY} ${SMALL}`}
      >
        Từ chối
      </button>
    </div>
  );
};
