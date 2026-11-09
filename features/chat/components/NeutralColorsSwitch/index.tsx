"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";

import { useNeutralChatColors } from "@/features/chat/hooks/use-neutral-chat-colors";

// Admin-only "Màu trung tính" switch: shows every bubble in the default colours
// on this device. Stored locally, so trainees still see their own colours.
export const NeutralColorsSwitch = () => {
  const t = useTranslations("chat.neutralColors");
  const [checked, setChecked] = useNeutralChatColors();

  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id="neutral-colors-switch" className="text-sm font-medium">
          {t("label")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="neutral-colors-switch"
          aria-describedby="neutral-colors-help"
          onClick={() => setChecked(!checked)}
          className={clsx(
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-line transition-colors",
            checked ? "bg-accent" : "bg-line",
          )}
        >
          <span
            aria-hidden
            className={clsx(
              "inline-block size-5 rounded-full bg-white shadow transition-transform",
              checked ? "translate-x-6" : "translate-x-1",
            )}
          />
        </button>
      </div>
      <p id="neutral-colors-help" className="text-sm text-muted">
        {t("help")}
      </p>
    </div>
  );
};
