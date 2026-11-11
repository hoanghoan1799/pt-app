"use client";

import clsx from "clsx";
import { EllipsisVertical, Minus } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { Skeleton } from "@/components/common/Skeleton";
import { ICON_BUTTON } from "@/constants/styles";
import { PresenceStatus } from "@/features/chat/components/PresenceStatus";
import { usePeerPresence } from "@/features/chat/hooks/use-peer-presence";
import type { BubbleMeta, BubbleRole } from "@/features/chat-bubbles/types";

export interface PanelBox {
  left: number;
  top: number;
  width: number;
  height: number;
  // Transform origin: the active bubble's centre, relative to the panel.
  originX: number;
  originY: number;
}

interface BubblePanelProps {
  box: PanelBox;
  role: BubbleRole;
  isOpen: boolean;
  // The chat to show; null once collapsed and unmounted.
  meta: BubbleMeta | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  labels: {
    panel: string;
    loading: string;
    more: string;
    collapse: string;
    openFull: string;
    mute: string;
    close: string;
  };
  onCollapse: () => void;
  onOpenFull: () => void;
  onMute: () => void;
  onClose: () => void;
}

const MENU_ITEM =
  "flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm text-fg transition active:bg-line";

type Labels = BubblePanelProps["labels"];

interface PanelContentProps {
  role: BubbleRole;
  meta: BubbleMeta;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  labels: Labels;
  onCollapse: () => void;
  onOpenFull: () => void;
  onMute: () => void;
  onClose: () => void;
}

// Mounted per chat (keyed): the menu and the loading state start fresh.
const PanelContent = ({
  role,
  meta,
  iframeRef,
  labels,
  onCollapse,
  onOpenFull,
  onMute,
  onClose,
}: PanelContentProps) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  // Same source as the full chat header; seeded by the bubble's own fetch.
  const presence = usePeerPresence({
    role,
    userId: meta.userId,
    fromThread: meta.lastSeenAt,
  });

  // A tap elsewhere closes the menu.
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const onDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <>
      <header className="relative flex shrink-0 items-center gap-2 border-b border-line py-1.5 pr-1 pl-3">
        <Avatar
          name={meta.name}
          src={meta.avatarSrc}
          className="size-8 text-xs"
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base leading-tight font-bold text-fg">
            {meta.name}
          </h2>
          <PresenceStatus presence={presence} />
        </div>
        <div ref={menuRef} className="relative">
          <button
            type="button"
            aria-label={labels.more}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className={clsx(ICON_BUTTON, "size-10")}
          >
            <EllipsisVertical className="size-5" aria-hidden />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute top-full right-0 z-10 mt-1 w-60 rounded-xl border border-line bg-surface p-1 shadow-xl"
            >
              <button
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={pick(onOpenFull)}
              >
                {labels.openFull}
              </button>
              <button
                type="button"
                role="menuitem"
                className={MENU_ITEM}
                onClick={pick(onMute)}
              >
                {labels.mute}
              </button>
              <button
                type="button"
                role="menuitem"
                className={clsx(MENU_ITEM, "text-danger")}
                onClick={pick(onClose)}
              >
                {labels.close}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={labels.collapse}
          onClick={onCollapse}
          className={clsx(ICON_BUTTON, "size-10")}
        >
          <Minus className="size-5" aria-hidden />
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          src={meta.embedHref}
          title={labels.panel}
          onLoad={() => setIsLoaded(true)}
          className="size-full border-0 bg-bg"
        />
        {!isLoaded && (
          <div
            role="status"
            aria-label={labels.loading}
            className="absolute inset-0 flex flex-col justify-end gap-3 bg-bg p-4"
          >
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-10 w-3/5 rounded-2xl" />
            <Skeleton className="h-12 w-full rounded-full" />
          </div>
        )}
      </div>
    </>
  );
};

// The expanded chat: a small header (photo, name, menu, collapse) over the real
// chat screen in a same-origin iframe (`?embed=1`), with a skeleton until the
// frame has loaded.
export const BubblePanel = ({
  box,
  isOpen,
  meta,
  ...content
}: BubblePanelProps) => (
  <section
    role="dialog"
    aria-label={content.labels.panel}
    aria-hidden={!isOpen}
    data-open={isOpen}
    data-chat-bubble-panel
    className="cb-panel pointer-events-auto absolute z-[25] flex flex-col overflow-hidden rounded-[20px] border border-line bg-bg shadow-2xl"
    style={
      {
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        "--cb-ox": `${box.originX}px`,
        "--cb-oy": `${box.originY}px`,
      } as React.CSSProperties
    }
  >
    {meta && <PanelContent key={meta.key} meta={meta} {...content} />}
  </section>
);
