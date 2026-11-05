"use client";

import clsx from "clsx";
import { BellRing } from "lucide-react";

import {
  type PushRole,
  usePushSubscription,
} from "@/features/chat/hooks/use-push-subscription";

interface PushToggleProps {
  role: PushRole;
  itemClassName: string;
}

// "Thông báo đẩy" row of the header gear menu: shows whether push is on and
// turns it on or off. Where push cannot work it stays visible but disabled,
// with the reason. Mounted only while the menu is open.
export const PushToggle = ({ role, itemClassName }: PushToggleProps) => {
  const push = usePushSubscription(role);

  if (!push.isReady) {
    return null;
  }

  let note: string | null = null;

  if (!push.isAvailable) {
    note = "Chưa dùng được trên thiết bị này";
  } else if (push.needsInstall && !push.isSubscribed) {
    note = "Thêm app vào Màn hình chính trước";
  } else if (push.isBlocked && !push.isSubscribed) {
    note = "Đang bị chặn trong cài đặt trình duyệt";
  }
  const isDisabled = note !== null;
  const status = note ?? (push.isSubscribed ? "Đang bật" : "Đang tắt");

  return (
    <>
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={push.isSubscribed}
        aria-disabled={isDisabled || push.busy}
        onClick={() => {
          if (isDisabled || push.busy) {
            return;
          }
          if (push.isSubscribed) {
            void push.disable();
          } else {
            void push.enable();
          }
        }}
        className={clsx(
          itemClassName,
          (isDisabled || push.busy) && "opacity-60",
        )}
      >
        <BellRing className="size-5 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block">Thông báo đẩy</span>
          <span className="block text-xs text-muted">{status}</span>
        </span>
        {!isDisabled && (
          <span
            aria-hidden
            className={clsx(
              "relative h-6 w-10 shrink-0 rounded-full transition",
              push.isSubscribed ? "bg-accent" : "bg-line",
            )}
          >
            <span
              className={clsx(
                "absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all",
                push.isSubscribed ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
        )}
      </button>
      {push.error && (
        <p role="alert" className="px-3 pb-2 text-xs text-danger">
          {push.error}
        </p>
      )}
    </>
  );
};
