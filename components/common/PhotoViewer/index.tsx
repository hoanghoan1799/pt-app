"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { ICON_BUTTON } from "@/constants/styles";
import { downloadImage } from "@/utils/download";
import { swipeDirection } from "@/utils/swipe";

export interface ViewerPhoto {
  id: number;
  src: string;
  // Accessible name of the image, e.g. whose photo and when.
  label: string;
}

interface PhotoViewerProps {
  photos: ViewerPhoto[];
  // Index of the photo on screen, or null while closed.
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  // File name of a download for the photo, given the real image type.
  fileNameFor: (photo: ViewerPhoto, mime: string | null) => string;
  // Adds the "Xem trong tin nhắn" button.
  onShowInChat?: (photo: ViewerPhoto) => void;
  // Called when the reader is close to the last loaded photo (load more).
  onNearEnd?: () => void;
}

const NEAR_END = 3;

const ACTION_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold text-white transition active:bg-white/25 disabled:opacity-50";

// Full-screen viewer for a list of photos: previous / next by swipe, arrow
// buttons or arrow keys; closes on a tap outside the image, Esc or the close
// button. Offers a download and, optionally, a jump to the message. Rendered
// in a portal so no transform above can trap the fixed overlay.
export const PhotoViewer = ({
  photos,
  index,
  onIndexChange,
  onClose,
  fileNameFor,
  onShowInChat,
  onNearEnd,
}: PhotoViewerProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  // A swipe ends in a click on the backdrop; it must not close the viewer.
  const swiped = useRef(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const isOpen = index !== null && photos[index] !== undefined;
  const current = index === null ? undefined : photos[index];

  const go = (step: 1 | -1) => {
    if (index === null) {
      return;
    }
    const next = index + step;

    if (next >= 0 && next < photos.length) {
      onIndexChange(next);
    }
  };

  // Latest handlers for the key listener, which is attached once per open.
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);

  useEffect(() => {
    keyHandler.current = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowLeft") {
        go(-1);
      } else if (event.key === "ArrowRight") {
        go(1);
      } else if (event.key === "Tab") {
        // Keep focus inside the dialog.
        const focusable = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>(
            "button:not(:disabled)",
          ) ?? [],
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) {
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
  });

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => keyHandler.current(event);

    closeRef.current?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (index !== null && photos.length - 1 - index <= NEAR_END) {
      onNearEnd?.();
    }
  }, [index, photos.length, onNearEnd]);

  if (!current || index === null) {
    return null;
  }
  const hasPrevious = index > 0;
  const hasNext = index < photos.length - 1;

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadImage(current.src, (mime) => fileNameFor(current, mime));
    } finally {
      setIsDownloading(false);
    }
  };

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={current.label}
      data-photo-viewer
      onClick={() => {
        if (swiped.current) {
          swiped.current = false;
          return;
        }
        onClose();
      }}
      onPointerDown={(event) => {
        start.current = { x: event.clientX, y: event.clientY };
        swiped.current = false;
      }}
      onPointerUp={(event) => {
        const origin = start.current;

        start.current = null;
        if (!origin) {
          return;
        }
        const direction = swipeDirection(
          event.clientX - origin.x,
          event.clientY - origin.y,
        );

        if (direction) {
          swiped.current = true;
          go(direction === "next" ? 1 : -1);
        }
      }}
      onPointerCancel={() => {
        start.current = null;
      }}
      className="pointer-events-auto fixed inset-0 z-[100] flex touch-pan-y items-center justify-center bg-black select-none"
    >
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p
          data-photo-viewer-count
          className="rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white"
        >
          {index + 1} / {photos.length}
        </p>
        <button
          ref={closeRef}
          type="button"
          aria-label="Đóng"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className={`${ICON_BUTTON} bg-white/10 text-white`}
        >
          <X className="size-6" aria-hidden />
        </button>
      </div>

      {/* A plain img: the route is cookie-authenticated (see Avatar). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={current.id}
        src={current.src}
        alt={current.label}
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        className="max-h-[78vh] max-w-full object-contain"
      />

      {hasPrevious && (
        <button
          type="button"
          aria-label="Ảnh trước"
          onClick={(event) => {
            event.stopPropagation();
            go(-1);
          }}
          className={`${ICON_BUTTON} absolute top-1/2 left-2 -translate-y-1/2 bg-white/10 text-white`}
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
      )}
      {hasNext && (
        <button
          type="button"
          aria-label="Ảnh sau"
          onClick={(event) => {
            event.stopPropagation();
            go(1);
          }}
          className={`${ICON_BUTTON} absolute top-1/2 right-2 -translate-y-1/2 bg-white/10 text-white`}
        >
          <ChevronRight className="size-6" aria-hidden />
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <p className="max-w-full truncate text-sm text-white/80">
          {current.label}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            disabled={isDownloading}
            onClick={(event) => {
              event.stopPropagation();
              void handleDownload();
            }}
            className={ACTION_BUTTON}
          >
            <Download className="size-5" aria-hidden />
            Tải xuống
          </button>
          {onShowInChat && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onShowInChat(current);
              }}
              className={ACTION_BUTTON}
            >
              <MessageSquare className="size-5" aria-hidden />
              Xem trong tin nhắn
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
