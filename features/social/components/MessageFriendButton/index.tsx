"use client";

import clsx from "clsx";
import { MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { BUTTON_SECONDARY } from "@/constants/styles";
import { DM_MESSAGES } from "@/features/social/constants/dm";
import { openDmAction } from "@/features/social/services/dm-actions";
import { dmPath } from "@/features/social/utils/dm-rules";

interface MessageFriendButtonProps {
  userId: number;
  className?: string;
}

// "Nhắn tin" on a friend: gets or creates the conversation and opens it.
export const MessageFriendButton = ({
  userId,
  className,
}: MessageFriendButtonProps) => {
  const router = useRouter();
  const [isPending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    try {
      const result = await openDmAction(userId);

      if (result.status === "error") {
        toast.error(result.message);
        return;
      }
      router.push(dmPath(result.conversationId));
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => void handleClick()}
      className={clsx(BUTTON_SECONDARY, className)}
    >
      <MessageCircle className="size-5" aria-hidden />
      {DM_MESSAGES.MESSAGE_FRIEND}
    </button>
  );
};
