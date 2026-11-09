"use client";

import { BellRing, Share } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type PushRole,
  usePushSubscription,
} from "@/features/chat/hooks/use-push-subscription";

const BUTTON_BASE =
  "inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold transition active:opacity-80";

const TITLE_KEYS = {
  user: "titleUser",
  admin: "titleAdmin",
} as const satisfies Record<PushRole, string>;

interface PushOptInCardProps {
  role: PushRole;
}

// One-time card offering browser notifications for new chat messages. Remembers
// "Để sau" per role, so it shows once. Renders nothing where push cannot work.
export const PushOptInCard = ({ role }: PushOptInCardProps) => {
  const t = useTranslations("chat.pushOptIn");
  const { state, busy, error, enable, dismiss } = usePushSubscription(role);

  if (state === "hidden") {
    return null;
  }

  return (
    <section
      aria-label={t("sectionLabel")}
      className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-sm"
    >
      <div className="flex items-start gap-3">
        <BellRing className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">{t(TITLE_KEYS[role])}</p>
          {state === "ios-install-hint" && (
            <p className="text-muted">
              {t.rich("iosInstallHint", {
                share: () => (
                  <Share
                    className="inline size-4 align-text-bottom text-accent"
                    aria-hidden
                  />
                ),
              })}
            </p>
          )}
          {state === "denied" && <p className="text-muted">{t("denied")}</p>}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={dismiss}
          className={`${BUTTON_BASE} text-muted`}
        >
          {state === "denied" ? t("gotIt") : t("later")}
        </button>
        {state === "show" && (
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className={`${BUTTON_BASE} bg-accent text-accent-fg shadow-md shadow-accent/25 disabled:opacity-50`}
          >
            {t("enable")}
          </button>
        )}
      </div>
    </section>
  );
};
