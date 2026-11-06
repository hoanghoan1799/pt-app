"use client";

import clsx from "clsx";
import type { ReactNode } from "react";
import { Drawer } from "vaul";

interface BottomSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  // "alertdialog" for confirmations that need an answer.
  role?: "dialog" | "alertdialog";
  // A card with a 16px gutter instead of a full-width sheet.
  isFloating?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
}

export const BottomSheet = ({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  role,
  isFloating = false,
  onOpenAutoFocus,
}: BottomSheetProps) => (
  <Drawer.Root
    open={isOpen}
    onOpenChange={onOpenChange}
    // vaul's iOS keyboard handling resizes the sheet to the visual viewport
    // and does not always restore it, leaving it cut off with a gap below.
    // Sheets already scroll inside max-h-[94dvh], so the default is not needed.
    repositionInputs={false}
  >
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <Drawer.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        {...(role ? { role } : {})}
        onOpenAutoFocus={onOpenAutoFocus}
        className={clsx(
          "fixed inset-x-0 z-50 mx-auto flex max-h-[94dvh] flex-col bg-bg outline-none",
          isFloating
            ? "bottom-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-[min(32rem,calc(100%-2rem))] rounded-3xl border border-line"
            : "bottom-0 w-full max-w-lg rounded-t-3xl",
        )}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line" />
        <div className="shrink-0 px-4 pt-3 pb-3">
          <Drawer.Title className="text-lg font-bold text-fg">
            {title}
          </Drawer.Title>
          {description && (
            <Drawer.Description className="mt-0.5 text-sm text-muted">
              {description}
            </Drawer.Description>
          )}
        </div>
        {/* min-h-0 lets this flex child shrink below its content and scroll
            inside the sheet's max height. The bottom padding sits on an inner
            wrapper, not the scroller: a sticky child pins to the scroller's
            content box, so padding on the scroller itself pushed a pinned
            submit button up over the last field (KAN-131). scroll-pb keeps a
            focused field clear of such a pinned button. */}
        <div className="min-h-0 scroll-pb-24 overflow-y-auto overscroll-contain px-4">
          <div className="pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
            {children}
          </div>
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
);
