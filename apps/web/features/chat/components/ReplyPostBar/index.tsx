"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import { ICON_BUTTON } from "@/constants/styles";
import { DmPostQuote } from "@/features/social/components/DmPostQuote";
import type { DmReplyPostView } from "@/features/social/types/dm";

interface ReplyPostBarProps {
  post: DmReplyPostView & { available: true };
  onClose: () => void;
}

// The post being replied to, above the composer ("Trả lời qua tin nhắn").
export const ReplyPostBar = ({ post, onClose }: ReplyPostBarProps) => {
  const t = useTranslations("chat.replyPost");

  return (
    <div className="mx-3 mb-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <p className="px-1 text-xs font-semibold text-muted">{t("replying")}</p>
        <DmPostQuote post={post} variant="bar" />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t("cancel")}
        className={ICON_BUTTON}
      >
        <X className="size-5" aria-hidden />
      </button>
    </div>
  );
};
