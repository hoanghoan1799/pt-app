"use client";

import clsx from "clsx";
import { ArrowUp, ImagePlus, Loader2, X } from "lucide-react";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { ROUTES } from "@/constants/routes";
import {
  BUTTON_SECONDARY,
  ICON_BUTTON,
  PAGE_CONTAINER,
} from "@/constants/styles";
import { useClearNotifications } from "@/features/chat/hooks/use-clear-notifications";
import { dmNotificationTags } from "@/features/chat/utils/clear-notifications";
import {
  encodePhoto,
  PhotoImageError,
} from "@/features/chat/utils/encode-photo";
import { PHOTO_ERRORS } from "@/features/chat/utils/photo-rules";
import { DmBubbleList } from "@/features/social/components/DmBubbleList";
import { DmPostQuote } from "@/features/social/components/DmPostQuote";
import { DM_BODY_MAX_LENGTH } from "@/features/social/constants/dm";
import { useDmThread } from "@/features/social/hooks/use-dm-thread";
import type { DmReplyPostView, DmThreadPage } from "@/features/social/types/dm";
import { lastSeenOwnId } from "@/features/social/utils/dm-thread-rules";
import { profilePath } from "@/features/social/utils/post-rules";

interface DmThreadProps {
  conversationId: number;
  meId: number;
  other: { id: number; name: string; avatarUrl: string | null };
  // A post being replied to (opened from a post card); sent with the next message.
  replyPost?: (DmReplyPostView & { available: true }) | null;
  initial: DmThreadPage & {
    readOnlyReason: string | null;
    isReadOnly: boolean;
  };
}

interface PendingPhoto {
  id: number;
  url: string;
  width: number;
  height: number;
}

// A friend chat (v1): text and one photo per message, unsend, "Đã xem", 5 s
// polling. When the chat is read-only the composer gives way to the reason.
export const DmThread = ({
  conversationId,
  meId,
  other,
  replyPost = null,
  initial,
}: DmThreadProps) => {
  const router = useRouter();
  const pathname = usePathname();
  const thread = useDmThread({ conversationId, meId, initial });
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [isUploading, setUploading] = useState(false);
  const [quote, setQuote] = useState(replyPost);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastCount = thread.items.length;
  const isReadOnly = thread.readOnlyReason !== null;

  useClearNotifications(dmNotificationTags(conversationId), lastCount);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lastCount]);

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      const prepared = await encodePhoto(file);
      const response = await fetch(
        `/api/dm/photos?conversationId=${conversationId}`,
        { method: "POST", body: prepared.blob },
      );

      if (!response.ok) {
        const data: { message?: string } = await response
          .json()
          .catch(() => ({}));

        toast.error(data.message ?? PHOTO_ERRORS.GENERIC);
        return;
      }
      const data: { photo: { id: number } } = await response.json();

      setPhoto({
        id: data.photo.id,
        url: `/api/dm/photos/${data.photo.id}`,
        width: prepared.width,
        height: prepared.height,
      });
    } catch (error) {
      toast.error(
        error instanceof PhotoImageError ? error.message : PHOTO_ERRORS.GENERIC,
      );
    } finally {
      setUploading(false);
      if (fileRef.current) {
        fileRef.current.value = "";
      }
    }
  };

  // A post reply needs a text; otherwise a text or a photo.
  const canSend =
    (quote ? text.trim() !== "" : text.trim() !== "" || photo !== null) &&
    !isUploading;

  // Drop "?replyPost=" so a refresh does not attach the post again.
  const clearQuote = () => {
    setQuote(null);
    if (replyPost) {
      router.replace(pathname, { scroll: false });
    }
  };

  const t = useTranslations("social.dmThread");

  const handleSend = () => {
    if (!canSend) {
      return;
    }
    thread.send(text, photo, quote);
    setText("");
    setPhoto(null);
    if (quote) {
      clearQuote();
    }
  };

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="sticky top-0 z-30 shrink-0 border-b border-line bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div
          className={clsx(PAGE_CONTAINER, "flex min-h-14 items-center gap-2")}
        >
          <Link
            href={ROUTES.MESSAGES}
            className={clsx(ICON_BUTTON, "-ml-3")}
            aria-label={t("back")}
          >
            <ChevronLeft className="size-6" aria-hidden />
          </Link>
          <Link
            href={profilePath("user", other.id)}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              name={other.name}
              src={other.avatarUrl}
              className="size-9 shrink-0 text-sm"
            />
            <span className="truncate text-lg font-bold text-fg">
              {other.name}
            </span>
          </Link>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className={clsx(PAGE_CONTAINER, "space-y-3 py-4")}>
          {thread.hasMore && (
            <button
              type="button"
              onClick={() => void thread.loadOlder()}
              className={clsx(BUTTON_SECONDARY, "w-full")}
            >
              {t("loadOlder")}
            </button>
          )}
          {thread.items.length === 0 ? (
            <p className="py-10 text-center text-muted">{t("noMessages")}</p>
          ) : (
            <DmBubbleList
              items={thread.items}
              meId={meId}
              seenId={lastSeenOwnId(thread.items, meId, thread.otherReadUpTo)}
              onUnsend={(id) => void thread.unsend(id)}
              onRetry={thread.retry}
            />
          )}
          <div ref={endRef} />
        </div>
      </main>
      <footer className="shrink-0 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)]">
        {isReadOnly ? (
          <p
            role="status"
            className={clsx(
              PAGE_CONTAINER,
              "py-4 text-center text-sm text-muted",
            )}
          >
            {thread.readOnlyReason}
          </p>
        ) : (
          <div className={clsx(PAGE_CONTAINER, "space-y-2 py-2")}>
            {quote && (
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="px-1 text-xs font-semibold text-muted">
                    {t("replying")}
                  </p>
                  <DmPostQuote post={quote} variant="bar" />
                </div>
                <button
                  type="button"
                  onClick={clearQuote}
                  aria-label={t("cancelReply")}
                  className={ICON_BUTTON}
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            )}
            {(photo || isUploading) && (
              <div className="flex items-center gap-2">
                {photo ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt={t("photoAlt")}
                      className="size-16 rounded-xl border border-line object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => setPhoto(null)}
                      aria-label={t("removePhoto")}
                      className="absolute -top-2 -right-2 inline-flex size-6 items-center justify-center rounded-full bg-fg text-bg shadow"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    {t("uploading")}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileRef.current?.click()}
                aria-label={t("attachPhoto")}
                className={ICON_BUTTON}
              >
                <ImagePlus className="size-6" aria-hidden />
              </button>
              <textarea
                value={text}
                maxLength={DM_BODY_MAX_LENGTH}
                rows={1}
                placeholder={t("placeholder")}
                aria-label={t("messageLabel")}
                onChange={(event) => setText(event.target.value)}
                className="max-h-[120px] min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-base leading-6 text-fg placeholder:text-muted focus:border-accent focus:outline-none"
              />
              <button
                type="button"
                disabled={!canSend}
                onClick={handleSend}
                aria-label={t("send")}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg transition active:scale-90 disabled:opacity-40"
              >
                <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
};
