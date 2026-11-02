"use client";

import { Share } from "lucide-react";

import { useInstallPrompt } from "@/features/pwa/hooks/use-install-prompt";

const BUTTON_BASE =
  "inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-opacity active:opacity-80";

// Floating banner above the UserTabBar offering to install the app. Android
// and desktop Chrome wait for the browser's install event; iOS and in-app
// browsers get a how-to hint instead.
export const InstallPrompt = () => {
  const { visible, platform, install, dismiss } = useInstallPrompt();

  if (!visible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 px-3">
      <section
        role="region"
        aria-label="Cài ứng dụng"
        className="pointer-events-auto mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-line bg-surface p-4 text-sm shadow-[0_10px_30px_-8px_rgb(0_0_0/0.35)]"
      >
        {platform === "ios" ? (
          <p>
            Để cài app: bấm nút Chia sẻ{" "}
            <Share
              className="inline size-4 align-text-bottom text-accent"
              aria-hidden
            />{" "}
            rồi chọn &quot;Thêm vào MH chính&quot;
          </p>
        ) : null}
        {platform === "in-app" ? (
          <p>Mở trang này bằng Safari hoặc Chrome để cài app</p>
        ) : null}
        {platform === "android" || platform === "other" ? (
          <p>Cài PT App lên màn hình chính để mở nhanh hơn</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className={`${BUTTON_BASE} text-muted`}
          >
            Để sau
          </button>
          {platform === "android" || platform === "other" ? (
            <button
              type="button"
              onClick={install}
              className={`${BUTTON_BASE} bg-accent text-accent-fg shadow-md shadow-accent/25`}
            >
              Cài đặt
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
};
