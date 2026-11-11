"use client";

import clsx from "clsx";
import type { KeyboardEvent, PointerEvent } from "react";

import { Avatar } from "@/components/common/Avatar";
import { BUBBLE_SIZE } from "@/features/chat-bubbles/constants";
import type { BubbleMeta } from "@/features/chat-bubbles/types";

const MAX_SHOWN = 99;

interface BubbleItemProps {
  meta: BubbleMeta;
  x: number;
  y: number;
  z: number;
  side: "left" | "right";
  badge: number;
  label: string;
  badgeLabel: string;
  isActive: boolean;
  isOnline?: boolean;
  isDragging: boolean;
  isExiting?: boolean;
  handlers?: {
    onPointerDown: (event: PointerEvent) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: (event: PointerEvent) => void;
  };
  onActivate?: () => void;
}

// One round bubble: the other person's photo (initials without one) and an
// unread badge. Draggable by pointer; Enter / Space does what a tap does.
export const BubbleItem = ({
  meta,
  x,
  y,
  z,
  side,
  badge,
  label,
  badgeLabel,
  isActive,
  isOnline = false,
  isDragging,
  isExiting = false,
  handlers,
  onActivate,
}: BubbleItemProps) => {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={isExiting ? -1 : 0}
      aria-label={label}
      aria-pressed={isActive}
      aria-hidden={isExiting || undefined}
      data-chat-bubble={meta.key}
      data-exit={isExiting}
      data-dragging={isDragging}
      onKeyDown={onKeyDown}
      {...handlers}
      className="cb-bubble pointer-events-auto absolute cursor-grab rounded-full"
      style={
        {
          left: x,
          top: y,
          zIndex: z,
          width: BUBBLE_SIZE,
          height: BUBBLE_SIZE,
          "--cb-dir": side === "left" ? -1 : 1,
        } as React.CSSProperties
      }
    >
      <Avatar
        name={meta.name}
        src={meta.avatarSrc}
        className={clsx(
          "size-14 text-lg shadow-lg ring-[3px]",
          isActive ? "ring-accent" : "ring-bg",
        )}
      />
      {isOnline && (
        <span
          aria-hidden
          className="absolute right-0.5 bottom-0.5 size-3 rounded-full bg-success ring-2 ring-bg"
        />
      )}
      {badge > 0 && (
        <span
          role="status"
          aria-label={badgeLabel}
          className="absolute -top-1 -right-1 inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-danger px-1.5 text-xs leading-none font-bold text-white ring-2 ring-bg"
        >
          {badge > MAX_SHOWN ? `${MAX_SHOWN}+` : badge}
        </span>
      )}
    </div>
  );
};
