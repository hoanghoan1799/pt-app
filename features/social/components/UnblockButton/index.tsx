"use client";

import { BUTTON_SECONDARY } from "@/constants/styles";
import { FRIEND_MESSAGES } from "@/features/social/constants/social";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { unblockUserAction } from "@/features/social/services/friend-actions";

export const UnblockButton = ({ userId }: { userId: number }) => {
  const { isPending, run } = useSocialAction();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        run(() => unblockUserAction(userId), {
          successMessage: FRIEND_MESSAGES.UNBLOCKED,
        })
      }
      className={`${BUTTON_SECONDARY} min-h-11 px-4 text-sm`}
    >
      Bỏ chặn
    </button>
  );
};
