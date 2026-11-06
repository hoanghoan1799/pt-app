"use client";

import clsx from "clsx";
import { ChevronLeft, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

import { ROUTES } from "@/constants/routes";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";
import { canGoBackInApp } from "@/features/chat/utils/chat-back";
import { initialsOf } from "@/features/chat/utils/chat-thread-rules";
import type { PresenceView } from "@/features/chat/utils/presence-status";

interface ChatHeaderProps {
  name: string;
  presence: PresenceView | null;
  // Opens the conversation settings sheet (KAN-142).
  onOpenSettings: () => void;
}

// The trainee thread header: Back, avatar, the PT's name with a green dot
// when online, and the status text under it.
export const ChatHeader = ({
  name,
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
        <button
          type="button"
          onClick={handleBack}
          className={clsx(ICON_BUTTON, "-ml-3")}
          aria-label="Quay lại"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        {/* Tapping the avatar or the name opens the settings too; the gear
            button is the keyboard and screen reader entry. */}
        <span
          aria-hidden
          onClick={onOpenSettings}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-fg"
        >
          {initialsOf(name)}
        </span>
        <div
          className="min-w-0 flex-1 py-2"
          data-chat-header-name
          onClick={onOpenSettings}
        >
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-base leading-tight font-bold text-fg">
              {name}
            </h1>
            {presence?.online && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full bg-success"
              />
            )}
          </div>
          {presence?.text && (
            <p
              role="status"
              aria-live="off"
              aria-label={`Trạng thái hoạt động: ${presence.text}`}
              data-online={presence.online}
              className={clsx(
                "truncate text-xs leading-tight",
                presence.online ? "font-medium text-fg" : "text-muted",
              )}
            >
              {presence.text}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className={clsx(ICON_BUTTON, "-mr-3")}
          aria-label="Cài đặt cuộc trò chuyện"
        >
          <Settings className="size-5" aria-hidden />
        </button>
      </div>
    </header>
  );
};
