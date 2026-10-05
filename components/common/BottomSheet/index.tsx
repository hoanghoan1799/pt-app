"use client";

import type { ReactNode } from "react";
import { Drawer } from "vaul";

interface BottomSheetProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export const BottomSheet = ({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
}: BottomSheetProps) => (
  <Drawer.Root open={isOpen} onOpenChange={onOpenChange}>
    <Drawer.Portal>
      <Drawer.Overlay className="fixed inset-0 z-40 bg-black/50" />
      <Drawer.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] w-full max-w-lg flex-col rounded-t-3xl bg-bg outline-none"
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
        <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          {children}
        </div>
      </Drawer.Content>
    </Drawer.Portal>
  </Drawer.Root>
);
