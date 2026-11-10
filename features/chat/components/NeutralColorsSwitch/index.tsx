"use client";

import clsx from "clsx";
import { Palette } from "lucide-react";
import { useTranslations } from "next-intl";

import { useNeutralChatColors } from "@/features/chat/hooks/use-neutral-chat-colors";

// Admin-only "Màu trung tính" switch in the chat header, next to the gear:
// shows every bubble in the default colours on this device. Stored locally,
// so trainees still see their own colours. The palette icon and the track are
// one tap target; the label and help are the accessible name and tooltip.
export const NeutralColorsSwitch = () => {
  const t = useTranslations("chat.neutralColors");
  const [checked, setChecked] = useNeutralChatColors();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={t("label")}
      title={`${t("label")}: ${t("help")}`}
      onClick={() => setChecked(!checked)}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-1"
    >
      <Palette
        className={clsx("size-4", checked ? "text-accent" : "text-muted")}
        aria-hidden
      />
      <span
        aria-hidden
        className={clsx(
          "relative inline-flex h-5 w-9 items-center rounded-full border border-line transition-colors",
          checked ? "bg-accent" : "bg-line",
        )}
      >
        <span
          className={clsx(
            "inline-block size-3.5 rounded-full bg-white shadow transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
};
