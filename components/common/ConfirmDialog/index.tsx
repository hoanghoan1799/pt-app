"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import {
  confirmStore,
  useConfirmState,
} from "@/components/common/ConfirmDialog/use-confirm";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
} from "@/constants/styles";

// Mounted once in the root layout; `useConfirm()` opens it from anywhere.
export const ConfirmDialog = () => {
  const t = useTranslations("common.confirm");
  const { isOpen, options, requestId } = useConfirmState();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // The sheet's own auto focus does not run when a dialog opens again before
  // the previous one finished closing.
  useEffect(() => {
    if (requestId > 0) {
      const frame = requestAnimationFrame(() => cancelRef.current?.focus());

      return () => cancelAnimationFrame(frame);
    }
  }, [requestId]);

  if (!options) {
    return null;
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      // Esc and a tap on the scrim arrive here as `false`.
      onOpenChange={(open) => {
        if (!open) {
          confirmStore.resolve(false);
        }
      }}
      title={options.title}
      description={options.description}
      role="alertdialog"
      isFloating
      onOpenAutoFocus={(event) => {
        // The safe choice gets focus, not the destructive one.
        event.preventDefault();
        cancelRef.current?.focus();
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <button
          ref={cancelRef}
          type="button"
          onClick={() => confirmStore.resolve(false)}
          className={BUTTON_SECONDARY}
        >
          {options.cancelLabel ?? t("cancel")}
        </button>
        <button
          type="button"
          onClick={() => confirmStore.resolve(true)}
          className={options.isDanger ? BUTTON_DANGER : BUTTON_PRIMARY}
        >
          {options.confirmLabel}
        </button>
      </div>
    </BottomSheet>
  );
};
