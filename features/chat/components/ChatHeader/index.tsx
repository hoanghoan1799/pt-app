"use client";

import clsx from "clsx";
import { ChevronLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Avatar } from "@/components/common/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";
import { PresenceStatus } from "@/features/chat/components/PresenceStatus";
import { canGoBackInApp } from "@/features/chat/utils/chat-back";
import type { PresenceView } from "@/features/chat/utils/presence-status";
import { MinimizeButton } from "@/features/chat-bubbles/components/MinimizeButton";
import type { BubbleRole } from "@/features/chat-bubbles/types";

interface ChatHeaderProps {
  // The shown name (the viewer's private nickname first); also feeds the avatar initials.
  name: string;
  // Heading text when it differs from the name ("Nhắn tin với ...").
  title?: string;
  // Admin side: a fixed route back instead of the browser history.
  backHref?: string;
  // The other side's photo (versioned URL); initials when null.
  avatarSrc?: string | null;
  // Accessible name of the gear; the link shows an icon only.
  settingsLabel?: string;
  presence: PresenceView | null;
  // Show the blue tick next to the name (verified PT).
  verified?: boolean;
  // The chat info page (KAN-160): the avatar, the name and the gear go there.
  infoHref: string;
  // Shows the "minimize to a bubble" button: the bubble key of this chat.
  bubble?: { role: BubbleRole; key: string };
}

// The thread header (both sides): Back, avatar, the name with the settings
// gear on the same row, and under the name the green dot and status text.
export const ChatHeader = ({
  name,
  title = name,
  backHref,
  avatarSrc = null,
  settingsLabel,
  presence,
  infoHref,
  verified = false,
  bubble,
}: ChatHeaderProps) => {
  const t = useTranslations("chat.chatHeader");
  const router = useRouter();

  const handleBack = () => {
    if (backHref) {
      router.push(backHref);
      return;
    }
    if (
      canGoBackInApp(
        window.history.length,
        document.referrer,
        window.location.origin,
      )
    ) {
      router.back();
    } else {
      router.push(ROUTES.WORKOUTS);
    }
  };

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)]">
      <div className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-2")}>
        {backHref ? (
          <Link
            href={backHref}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleBack}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}
        {/* The avatar and the name open the info page too; the gear link is
            the keyboard and screen reader entry. */}
        <Link href={infoHref} tabIndex={-1} aria-hidden className="shrink-0">
          <Avatar name={name} src={avatarSrc} className="size-9 text-sm" />
        </Link>
        <Link
          href={infoHref}
          tabIndex={-1}
          data-chat-header-name
          className="min-w-0 flex-1 py-2"
        >
          <h1 className="truncate text-base leading-tight font-bold text-fg">
            {title}
            {verified && <VerifiedBadge className="ml-1" />}
          </h1>
          <PresenceStatus presence={presence} />
        </Link>
        {bubble && (
          <MinimizeButton
            role={bubble.role}
            bubbleKey={bubble.key}
            onMinimized={handleBack}
          />
        )}
        <Link
          href={infoHref}
          className={clsx(ICON_BUTTON, "-mr-3")}
          aria-label={settingsLabel ?? t("settings")}
        >
          <Settings className="size-5" aria-hidden />
        </Link>
      </div>
    </header>
  );
};
