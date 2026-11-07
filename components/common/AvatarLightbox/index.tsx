"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { ICON_BUTTON } from "@/constants/styles";

interface AvatarLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  // Whose photo, for the accessible name.
  name: string;
}

// Full-screen photo viewer: dark backdrop, the image contained within 90% of
// the screen. Closes on a tap outside the image, Esc or the close button.
// Rendered in a portal so a sheet's transform cannot trap the fixed overlay.
export const AvatarLightbox = ({
  isOpen,
  onClose,
  src,
  name,
}: AvatarLightboxProps) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "Tab") {
        // The close button is the only control: keep focus on it.
        event.preventDefault();
        closeRef.current?.focus();
      }
    };

    closeRef.current?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Ảnh của ${name}`}
      data-avatar-lightbox
      onClick={onClose}
      className="pointer-events-auto fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"
    >
      <button
        ref={closeRef}
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className={`${ICON_BUTTON} absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 bg-white/10 text-white`}
      >
        <X className="size-6" aria-hidden />
      </button>
      {/* A plain img: the route is cookie-authenticated (see Avatar). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={name}
        draggable={false}
        onClick={(event) => event.stopPropagation()}
        className="h-auto w-[min(90vw,90vh)] rounded-2xl object-contain"
      />
    </div>,
    document.body,
  );
};
