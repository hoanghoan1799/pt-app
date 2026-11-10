"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";

import { useBubblePopSetting } from "@/features/chat-bubbles/hooks/use-bubble-pop-setting";

// "Show a chat bubble on new messages" on this device (chat info page).
export const BubblePopSwitch = () => {
  const t = useTranslations("chat.bubbles");
  const [checked, setChecked] = useBubblePopSetting();

  return (
    <div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id="bubble-pop-switch" className="text-sm font-medium">
          {t("popLabel")}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-labelledby="bubble-pop-switch"
          aria-describedby="bubble-pop-help"
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
      <p id="bubble-pop-help" className="text-sm text-muted">
        {t("popHelp")}
      </p>
    </div>
  );
};
