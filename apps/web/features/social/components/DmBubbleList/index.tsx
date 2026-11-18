"use client";

import clsx from "clsx";
import { RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ChatPhotoGrid } from "@/features/chat/components/ChatPhotoGrid";
import { ChatPhotoImage } from "@/features/chat/components/ChatPhotoImage";
import { ChatPhotoViewer } from "@/features/chat/components/ChatPhotoViewer";
import { type ChatPhoto, PHOTO_ALT } from "@/features/chat/utils/photo-rules";
import { DmPostQuote } from "@/features/social/components/DmPostQuote";
import type { DmThreadItem } from "@/features/social/utils/dm-thread-rules";
import { type Locale, toIntlLocale } from "@/utils/locale";

interface DmBubbleListProps {
  items: DmThreadItem[];
  // The signed-in trainee; null for the read-only admin view.
  meId: number | null;
  // Admin view: sender names by id.
  names?: Map<number, string>;
  // The own message the other member has read last.
  seenId?: number | null;
  onUnsend?: (messageId: number) => void;
  onRetry?: (clientId: string) => void;
}

const toChatPhotos = (
  photos: { url: string; width: number; height: number }[],
) => photos.map((photo): ChatPhoto => ({ ...photo, alt: PHOTO_ALT }));

const formatTime = (iso: string, locale: Locale) =>
  new Date(iso).toLocaleTimeString(toIntlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });

// Plain bubbles in the chat colours: mine on the right in the accent colour,
// theirs on the left. An own message has a "Thu hồi" button (confirm-free: the
// message is only taken back, nothing else is lost).
export const DmBubbleList = ({
  items,
  meId,
  names,
  seenId = null,
  onUnsend,
  onRetry,
}: DmBubbleListProps) => {
  const locale = useLocale();
  const t = useTranslations("social.dmBubbleList");
  // The message whose photos are open in the viewer, and the photo on screen.
  const [viewer, setViewer] = useState<{
    clientId: string;
    index: number;
  } | null>(null);
  const viewed = items.find((item) => item.clientId === viewer?.clientId);

  return (
    <>
      <ul className="flex flex-col gap-2">
        {items.map((item) => {
          const isMine = meId !== null && item.senderId === meId;

          return (
            <li
              key={item.clientId}
              className={clsx(
                "flex flex-col gap-0.5",
                isMine ? "items-end" : "items-start",
              )}
            >
              {names && (
                <span className="px-1 text-xs font-medium text-muted">
                  {names.get(item.senderId) ?? t("deleted")}
                </span>
              )}
              <div
                className={clsx(
                  "max-w-[80%] space-y-1.5 rounded-2xl px-3 py-2 text-base break-words",
                  isMine
                    ? "bg-accent text-accent-fg"
                    : "border border-line bg-surface text-fg",
                  item.pending === "sending" && "opacity-70",
                )}
              >
                {item.post && <DmPostQuote post={item.post} />}
                {item.photos.length > 1 && (
                  <ChatPhotoGrid
                    photos={toChatPhotos(item.photos)}
                    isDimmed={item.pending === "sending"}
                    onOpen={(index) =>
                      setViewer({ clientId: item.clientId, index })
                    }
                  />
                )}
                {item.photos.length === 1 && item.photo && (
                  <ChatPhotoImage
                    photo={{ ...item.photo, alt: PHOTO_ALT }}
                    isDimmed={item.pending === "sending"}
                  />
                )}
                {item.body && (
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {item.body}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 px-1 text-xs text-muted">
                <time dateTime={item.createdAt}>
                  {formatTime(item.createdAt, locale)}
                </time>
                {item.pending === "failed" && onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(item.clientId)}
                    className="inline-flex min-h-8 items-center gap-1 font-semibold text-danger"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {t("retry")}
                  </button>
                )}
                {isMine && !item.pending && seenId === item.id && (
                  <span>{t("seen")}</span>
                )}
                {isMine && !item.pending && onUnsend && (
                  <button
                    type="button"
                    onClick={() => onUnsend(item.id)}
                    className="inline-flex min-h-8 items-center font-semibold"
                  >
                    {t("unsend")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ChatPhotoViewer
        photos={toChatPhotos(viewed?.photos ?? [])}
        index={viewed ? (viewer?.index ?? null) : null}
        onIndexChange={(index) =>
          setViewer((current) => (current ? { ...current, index } : current))
        }
        onClose={() => setViewer(null)}
      />
    </>
  );
};
