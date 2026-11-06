"use client";

import { X } from "lucide-react";

import { ICON_BUTTON } from "@/constants/styles";

interface ReplyBarProps {
  // "Đang trả lời" / "Đang chỉnh sửa".
  title: string;
  snippet?: string;
  closeLabel: string;
  onClose: () => void;
}

// The bar above the composer while replying to or editing a message.
export const ReplyBar = ({
  title,
  snippet,
  closeLabel,
  onClose,
}: ReplyBarProps) => (
  <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl border border-line bg-surface py-1.5 pr-1 pl-3">
    <div className="min-w-0 flex-1 border-l-2 border-accent pl-2">
      <p className="truncate text-xs font-semibold text-accent">{title}</p>
      {snippet !== undefined && (
        <p className="truncate text-sm text-muted">{snippet}</p>
      )}
    </div>
    <button
      type="button"
      onClick={onClose}
      aria-label={closeLabel}
      className={ICON_BUTTON}
    >
      <X className="size-5" aria-hidden />
    </button>
  </div>
);
