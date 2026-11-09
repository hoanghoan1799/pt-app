"use client";

import clsx from "clsx";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Spinner } from "@/components/common/Spinner";
import {
  CHAT_PALETTE,
  type ChatColorKey,
} from "@/features/chat/utils/chat-palette";

interface ColorSwatchesProps {
  name: string;
  label: string;
  selected: ChatColorKey | null;
  disabled: boolean;
  // A save is running: the tapped swatch shows a spinner.
  isPending?: boolean;
  onPick: (color: ChatColorKey) => void;
}

// The 8 palette colours as a radio group; white text on each is AA (D5).
export const ColorSwatches = ({
  name,
  label,
  selected,
  disabled,
  isPending = false,
  onPick,
}: ColorSwatchesProps) => {
  const t = useTranslations("chat.colors");
  const [tapped, setTapped] = useState<ChatColorKey | null>(null);

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-busy={isPending}
      className="flex flex-wrap gap-2.5"
    >
      {CHAT_PALETTE.map((entry) => {
        const isSelected = entry.key === selected;

        return (
          <button
            key={entry.key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={t(`names.${entry.key}`)}
            title={t(`names.${entry.key}`)}
            data-color-option={entry.key}
            data-color-group={name}
            disabled={disabled}
            aria-busy={isPending && tapped === entry.key}
            onClick={() => {
              setTapped(entry.key);
              onPick(entry.key);
            }}
            style={{ backgroundColor: entry.bg }}
            className={clsx(
              "flex size-11 items-center justify-center rounded-full text-white transition active:scale-95 disabled:opacity-40",
              isSelected && "ring-2 ring-fg ring-offset-2 ring-offset-bg",
            )}
          >
            {isPending && tapped === entry.key ? (
              <Spinner size="md" />
            ) : (
              isSelected && <Check className="size-5" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
};
