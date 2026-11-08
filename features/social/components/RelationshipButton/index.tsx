"use client";

import { Check, ChevronDown, UserPlus } from "lucide-react";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { BUTTON_PRIMARY, BUTTON_SECONDARY } from "@/constants/styles";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import {
  acceptFriendRequestAction,
  cancelFriendRequestAction,
  declineFriendRequestAction,
  sendFriendRequestAction,
  unfriendAction,
} from "@/features/social/services/friend-actions";
import type { Relationship } from "@/features/social/utils/friend-rules";

interface RelationshipButtonProps {
  userId: number;
  name: string;
  relationship: Exclude<Relationship, "self">;
  // Called after a change succeeded (the search result re-checks itself).
  onChanged?: () => void;
}

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-line/70";

// The button on a profile and in search results: Kết bạn / Đã gửi lời mời /
// Chấp nhận / Bạn bè (with Huỷ kết bạn).
export const RelationshipButton = ({
  userId,
  name,
  relationship,
  onChanged,
}: RelationshipButtonProps) => {
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const { isPending, run: runAction } = useSocialAction();
  const run = (
    action: () => Promise<{
      status: string;
      message?: string;
      reference?: string;
    }>,
  ) => runAction(action, { onSuccess: onChanged });

  if (relationship === "none") {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() => run(() => sendFriendRequestAction(userId))}
        className={BUTTON_PRIMARY}
      >
        <UserPlus className="size-5" aria-hidden />
        Kết bạn
      </button>
    );
  }
  if (relationship === "received") {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => acceptFriendRequestAction(userId))}
          className={BUTTON_PRIMARY}
        >
          <Check className="size-5" aria-hidden />
          Chấp nhận
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => declineFriendRequestAction(userId))}
          className={BUTTON_SECONDARY}
        >
          Từ chối
        </button>
      </div>
    );
  }
  const isFriend = relationship === "friends";

  const handleUnfriend = async () => {
    setMenuOpen(false);
    const isConfirmed = await confirm({
      title: `Huỷ kết bạn với ${name}?`,
      description: "Bạn sẽ không còn thấy bài viết dành cho bạn bè của nhau.",
      confirmLabel: "Huỷ kết bạn",
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => unfriendAction(userId));
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setMenuOpen(true)}
        className={BUTTON_SECONDARY}
      >
        {isFriend ? "Bạn bè" : "Đã gửi lời mời"}
        <ChevronDown className="size-5" aria-hidden />
      </button>
      <BottomSheet isOpen={isMenuOpen} onOpenChange={setMenuOpen} title={name}>
        <div className="space-y-1 pb-2">
          {isFriend ? (
            <button
              type="button"
              className={`${MENU_ITEM} text-danger`}
              onClick={handleUnfriend}
            >
              Huỷ kết bạn
            </button>
          ) : (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                run(() => cancelFriendRequestAction(userId));
              }}
            >
              Huỷ lời mời
            </button>
          )}
        </div>
      </BottomSheet>
    </>
  );
};
