"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Spinner } from "@/components/common/Spinner";
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
  const t = useTranslations("social.reactorsSheet");
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
      title={t("title")}
      description={t("description")}
    >
      {hasFailed ? (
        <p className="py-4 text-center text-muted">{t("loadFailed")}</p>
      ) : reactors === null ? (
        <div className="flex justify-center py-6">
          <Spinner size="lg" className="text-muted" />
        </div>
      ) : (
        <ul className="flex flex-col pb-2">
          {reactors.map((reactor, index) => (
            <li
              key={index}
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-base text-fg"
            >
              <span className="truncate font-medium">
                {reactor.isMe ? t("you") : reactor.name}
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
