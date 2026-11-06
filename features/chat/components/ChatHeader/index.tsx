"use client";

import clsx from "clsx";
import { ChevronLeft, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar } from "@/components/common/Avatar";
import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";
import { PresenceStatus } from "@/features/chat/components/PresenceStatus";
import { canGoBackInApp } from "@/features/chat/utils/chat-back";
import type { PresenceView } from "@/features/chat/utils/presence-status";

interface ChatHeaderProps {
  // The shown name (nickname first); also feeds the avatar initials.
  name: string;
  // Heading text when it differs from the name ("Nhắn tin với ...").
  title?: string;
  // Admin side: a fixed route back instead of the browser history.
  backHref?: string;
  // The other side's photo (versioned URL); initials when null.
  avatarSrc?: string | null;
  // Accessible name of the gear; the button shows an icon only.
  settingsLabel?: string;
  presence: PresenceView | null;
  // Opens the conversation settings sheet (KAN-142).
  onOpenSettings: () => void;
}

// The thread header (both sides): Back, avatar, the name with the settings
// gear on the same row, and under the name the green dot and status text.
export const ChatHeader = ({
  name,
  title = name,
  backHref,
  avatarSrc = null,
  settingsLabel = "Cài đặt cuộc trò chuyện",
  presence,
  onOpenSettings,
}: ChatHeaderProps) => {
  const router = useRouter();

  const handleBack = () => {
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
    <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-2")}>
        {backHref ? (
          <Link
            href={backHref}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label="Quay lại"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleBack}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label="Quay lại"
          >
            <ChevronLeft className="size-6" aria-hidden />
          </button>
        )}
        {/* Tapping the avatar or the name opens the settings too; the gear
            button is the keyboard and screen reader entry. */}
        <span onClick={onOpenSettings} className="shrink-0">
          <Avatar name={name} src={avatarSrc} className="size-9 text-sm" />
        </span>
        <div
          className="min-w-0 flex-1 py-2"
          data-chat-header-name
          onClick={onOpenSettings}
        >
          <h1 className="truncate text-base leading-tight font-bold text-fg">
            {title}
          </h1>
          <PresenceStatus presence={presence} />
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className={clsx(ICON_BUTTON, "-mr-3")}
          aria-label={settingsLabel}
        >
          <Settings className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
};
