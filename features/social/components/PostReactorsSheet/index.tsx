"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { listReactorsAction } from "@/features/social/services/engagement-actions";
import type { ReactorView } from "@/features/social/types/social";

interface PostReactorsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  postId: number;
  mode: "user" | "admin";
}

// Who reacted to a post, with the emoji each one chose. Loaded when opened,
// so the visibility check runs on the server every time.
export const PostReactorsSheet = ({
  isOpen,
  onOpenChange,
  postId,
  mode,
}: PostReactorsSheetProps) => {
  const [reactors, setReactors] = useState<ReactorView[] | null>(null);
  const [hasFailed, setFailed] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let isCurrent = true;

    void listReactorsAction(mode, postId).then((result) => {
      if (!isCurrent) {
        return;
      }
      if (result.status === "success") {
        setReactors(result.reactors);
        setFailed(false);
      } else {
        setFailed(true);
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [isOpen, mode, postId]);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Cảm xúc"
      description="Ai đã bày tỏ cảm xúc về bài viết này"
    >
      {hasFailed ? (
        <p className="py-4 text-center text-muted">Không tải được danh sách.</p>
      ) : reactors === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
        </div>
      ) : (
        <ul className="flex flex-col pb-2">
          {reactors.map((reactor, index) => (
            <li
              key={index}
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-base text-fg"
            >
              <span className="truncate font-medium">
                {reactor.isMe ? "Bạn" : reactor.name}
              </span>
              <span className="text-2xl" aria-label={reactor.emoji}>
                {reactor.emoji}
              </span>
            </li>
          ))}
        </ul>
      )}
    </BottomSheet>
  );
};
