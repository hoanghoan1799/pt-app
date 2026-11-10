import clsx from "clsx";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { InlineSkeleton, Skeleton } from "@/components/common/Skeleton";
import { ICON_BUTTON, PAGE_CONTAINER } from "@/constants/styles";

interface ChatThreadSkeletonProps {
  // A fixed route back (admin side) renders the real back link; without it
  // the back button depends on browser history, so it stays a placeholder.
  backHref?: string;
}

interface BubbleShape {
  own: boolean;
  width: string;
  height: string;
  // First bubble of a new sender group: larger gap above it.
  groupStart: boolean;
  // Last bubble of a peer group: shows the small avatar beside it.
  showAvatar: boolean;
}

// Peer (left) and own (right) bubbles, grouped like a real conversation.
const BUBBLES: readonly BubbleShape[] = [
  {
    own: false,
    width: "w-2/3",
    height: "h-14",
    groupStart: true,
    showAvatar: false,
  },
  {
    own: false,
    width: "w-1/2",
    height: "h-9",
    groupStart: false,
    showAvatar: true,
  },
  {
    own: true,
    width: "w-3/5",
    height: "h-14",
    groupStart: true,
    showAvatar: false,
  },
  {
    own: true,
    width: "w-2/5",
    height: "h-9",
    groupStart: false,
    showAvatar: false,
  },
  {
    own: false,
    width: "w-3/4",
    height: "h-14",
    groupStart: true,
    showAvatar: false,
  },
  {
    own: false,
    width: "w-2/5",
    height: "h-9",
    groupStart: false,
    showAvatar: false,
  },
  {
    own: false,
    width: "w-3/5",
    height: "h-9",
    groupStart: false,
    showAvatar: true,
  },
  {
    own: true,
    width: "w-1/2",
    height: "h-9",
    groupStart: true,
    showAvatar: false,
  },
  {
    own: true,
    width: "w-2/3",
    height: "h-14",
    groupStart: false,
    showAvatar: false,
  },
];

// Same motion as Skeleton, with the accent tint for the user's own bubbles.
const PULSE = "animate-pulse motion-reduce:animate-none";

// Full-screen thread placeholder: header, bottom-anchored bubbles, composer.
// The peer's name, photo and the messages are data; the back link is real when
// static. Placeholders fade in after a short delay (skeleton-delay) so fast
// navigations never flash them.
export const ChatThreadSkeleton = async ({
  backHref,
}: ChatThreadSkeletonProps) => {
  const t = await getTranslations("common");
  const tHeader = await getTranslations("chat.chatHeader");

  return (
    <div
      className="fixed inset-x-0 top-0 z-20 flex h-dvh flex-col bg-bg"
      aria-busy="true"
    >
      <div role="status" className="sr-only">
        {t("loading")}
      </div>
      <div className="border-b border-line pt-[env(safe-area-inset-top)]">
        <div className={`${PAGE_CONTAINER} flex min-h-14 items-center gap-2`}>
          {backHref ? (
            <Link
              href={backHref}
              className={clsx(ICON_BUTTON, "-ml-3")}
              aria-label={tHeader("back")}
            >
              <ChevronLeft className="size-6" aria-hidden />
            </Link>
          ) : (
            <div
              className={clsx(ICON_BUTTON, "-ml-3", "skeleton-delay")}
              aria-hidden
            >
              <Skeleton className="size-6 rounded-full" />
            </div>
          )}
          <div className="skeleton-delay flex min-w-0 flex-1 items-center gap-2">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="space-y-1.5 py-2">
              <InlineSkeleton className="h-4 w-32" />
              <InlineSkeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      </div>
      <div
        className="skeleton-delay flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-4 pb-3"
        aria-hidden
      >
        <div className="mx-auto flex w-full max-w-lg flex-col justify-end">
          <div className="flex justify-center pb-3">
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
          {BUBBLES.map((bubble, index) => (
            <div
              key={index}
              className={clsx(
                "flex items-end gap-2",
                bubble.own ? "justify-end" : "justify-start",
                index > 0 && (bubble.groupStart ? "mt-3" : "mt-1"),
              )}
            >
              {!bubble.own && (
                <div className="size-7 shrink-0">
                  {bubble.showAvatar && (
                    <Skeleton className="size-7 rounded-full" />
                  )}
                </div>
              )}
              <div
                className={clsx(
                  PULSE,
                  "rounded-2xl",
                  bubble.own ? "bg-accent/25" : "bg-line/60",
                  bubble.width,
                  bubble.height,
                )}
              />
            </div>
          ))}
        </div>
      </div>
      <div
        className="skeleton-delay pb-[calc(env(safe-area-inset-bottom)+0.5rem)]"
        aria-hidden
      >
        <div className={`${PAGE_CONTAINER} flex items-center gap-2 pt-2`}>
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <Skeleton className="h-11 flex-1 rounded-full" />
          <Skeleton className="size-10 shrink-0 rounded-full" />
        </div>
      </div>
    </div>
  );
};
