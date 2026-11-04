"use client";

import { Share } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { ROUTES } from "@/constants/routes";
import { useInstallPrompt } from "@/features/pwa/hooks/use-install-prompt";

const BUTTON_BASE =
  "inline-flex min-h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold transition-opacity active:opacity-80";

// Floating banner above the UserTabBar offering to install the app. Android
// and desktop Chrome wait for the browser's install event; iOS and in-app
// browsers get a how-to hint instead. Hidden on the chat page (KAN-102), where
// the composer is pinned above the tab bar and the banner would cover it.
export const InstallPrompt = () => {
  const { visible: canShow, platform, install, dismiss } = useInstallPrompt();
  const pathname = usePathname();
  const visible = canShow && !pathname.startsWith(ROUTES.MESSAGES);
  const bannerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);

  // The banner is fixed, so an in-flow spacer of the same height keeps the
  // last page content reachable above it. Written straight to the DOM.
  useEffect(() => {
    const banner = bannerRef.current;
    const spacer = spacerRef.current;

    if (!visible || !banner || !spacer) {
      return;
    }
    const sync = () => {
      spacer.style.height = `${banner.offsetHeight + 12}px`;
    };
    const observer = new ResizeObserver(sync);

    sync();
    observer.observe(banner);
    return () => observer.disconnect();
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <>
      <div aria-hidden ref={spacerRef} />
      <div
        ref={bannerRef}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-30 px-3"
      >
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
    </>
  );
};
