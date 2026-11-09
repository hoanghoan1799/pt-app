"use client";

import clsx from "clsx";
import { Copy, Pencil, Reply, Undo2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { CHAT_REACTION_EMOJIS } from "@/features/chat/utils/chat-rules";
import {
  canEditOrUnsend,
  formatSentAt,
  myReactionOf,
  type ThreadMessage,
  type ThreadViewer,
} from "@/features/chat/utils/chat-thread-rules";

interface MessageActionsSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  message: ThreadMessage;
  viewer: ThreadViewer;
  // False while chat is locked: the thread is read-only, only Copy remains.
  canWrite: boolean;
  onReact: (emoji: string | null) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onUnsend: () => void;
}

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium text-fg transition active:bg-line";

const ActionRow = ({
  icon,
  label,
  onClick,
  isDanger = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  isDanger?: boolean;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(ROW, isDanger && "text-danger")}
  >
    {icon}
    {label}
  </button>
);

// Long-press sheet: the six reactions (mine highlighted, tap again removes),
// the exact send time, then Reply / Copy / Edit / Unsend. Edit and Unsend are
// only offered on my own messages; a sticker offers neither Copy nor Edit.
export const MessageActionsSheet = ({
  isOpen,
  onOpenChange,
  message,
  viewer,
  canWrite,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onUnsend,
}: MessageActionsSheetProps) => {
  const locale = useLocale();
  const t = useTranslations("chat.messageActions");
  const mine = myReactionOf(message, viewer);
  // A sticker has no text: it can be reacted to, replied to and unsent only.
  // A photo without a caption has no text to copy or edit either.
  const isSticker =
    Boolean(message.sticker) || (Boolean(message.photo) && !message.body);
  const canModify = canWrite && canEditOrUnsend(message, viewer);

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t("title")}
      description={t("sentAt", {
        time: formatSentAt(message.createdAt, locale),
      })}
    >
      {canWrite && (
        <div
          role="group"
          aria-label={t("reactions")}
          className="mb-2 flex justify-between rounded-2xl border border-line bg-surface p-1.5"
        >
          {CHAT_REACTION_EMOJIS.map((emoji) => {
            const isMine = mine === emoji;

            return (
              <button
                key={emoji}
                type="button"
                aria-label={emoji}
                aria-pressed={isMine}
                onClick={() => onReact(isMine ? null : emoji)}
                className={clsx(
                  "flex size-11 items-center justify-center rounded-full text-2xl transition active:scale-90",
                  isMine && "bg-accent/20 ring-2 ring-accent",
                )}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-col">
        {canWrite && (
          <ActionRow
            icon={<Reply className="size-5" aria-hidden />}
            label={t("reply")}
            onClick={onReply}
          />
        )}
        {!isSticker && (
          <ActionRow
            icon={<Copy className="size-5" aria-hidden />}
            label={t("copy")}
            onClick={onCopy}
          />
        )}
        {canModify && !isSticker && (
          <ActionRow
            icon={<Pencil className="size-5" aria-hidden />}
            label={t("edit")}
            onClick={onEdit}
          />
        )}
        {canModify && (
          <ActionRow
            icon={<Undo2 className="size-5" aria-hidden />}
            label={t("unsend")}
            onClick={onUnsend}
            isDanger
          />
        )}
      </div>
    </BottomSheet>
  );
};
