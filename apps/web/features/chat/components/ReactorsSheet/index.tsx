"use client";

import { useTranslations } from "next-intl";

import { BottomSheet } from "@/components/common/BottomSheet";
import { reactorLabel } from "@/features/chat/utils/chat-settings";
import type {
  SerializedReaction,
  ThreadViewer,
} from "@/features/chat/utils/chat-thread-rules";
import { viewerReactorKey } from "@/features/chat/utils/chat-thread-rules";

interface ReactorsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  reactions: SerializedReaction[];
  viewer: ThreadViewer;
  nicknames?: Readonly<Record<string, string>>;
}

// Who reacted to a message, with the emoji each one chose.
export const ReactorsSheet = ({
  isOpen,
  onOpenChange,
  reactions,
  viewer,
  nicknames = {},
}: ReactorsSheetProps) => {
  const t = useTranslations("chat.reactorsSheet");
  const myKey = viewerReactorKey(viewer);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("description")}
    >
      <ul className="flex flex-col">
        {reactions.map((reaction) => (
          <li
            key={reaction.reactorKey}
            className="flex min-h-12 items-center justify-between gap-3 px-1 text-base text-fg"
          >
            <span className="truncate font-medium">
              {reaction.reactorKey === myKey
                ? t("you")
                : reactorLabel(
                    nicknames,
                    reaction.reactorKey,
                    reaction.reactorName,
                    viewer.role === "admin" ? "admin" : "user",
                  )}
            </span>
            <span className="text-2xl" aria-label={reaction.emoji}>
              {reaction.emoji}
            </span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
};
