"use client";

import clsx from "clsx";
import { ChevronRight, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { AvatarLightbox } from "@/components/common/AvatarLightbox";
import { AppHeader } from "@/components/layout/AppHeader";
import { PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { ChatCustomizePanel } from "@/features/chat/components/ChatCustomizePanel";
import { HideConversationButton } from "@/features/chat/components/HideConversationButton";
import { NeutralColorsSwitch } from "@/features/chat/components/NeutralColorsSwitch";
import { PresenceStatus } from "@/features/chat/components/PresenceStatus";
import { usePeerPresence } from "@/features/chat/hooks/use-peer-presence";
import type { ChatPaths } from "@/features/chat/utils/chat-links";
import {
  adminLabel,
  type ChatProfileView,
} from "@/features/chat/utils/chat-settings";
import type { ThreadViewer } from "@/features/chat/utils/chat-thread-rules";
import { displayNameFor } from "@/features/chat/utils/display-name";
import {
  type GalleryPhoto,
  photoLabel,
} from "@/features/chat/utils/gallery-rules";

export interface ChatInfoProps {
  viewer: ThreadViewer;
  // The trainee's id: the presence line of either side is looked up with it.
  userId: number;
  conversationId: number | null;
  // Real names, shown when there is no nickname.
  peerName: string;
  selfName: string;
  initialProfile: ChatProfileView;
  chatEnabled: boolean;
  // The other person's photo (versioned URL) or null for initials.
  peerAvatarUrl: string | null;
  paths: ChatPaths;
  // The newest photos, for the preview; empty when there are none.
  preview: GalleryPhoto[];
}

const ROUND_BUTTON =
  "flex size-12 items-center justify-center rounded-full bg-line text-fg transition active:scale-95";

// The chat info page (KAN-160), like Messenger's: the other person's photo,
// name and status, round buttons for the tools, the photos sent and the
// actions. It replaces the old settings sheet; everything in the sheet moved
// here (nicknames and colours under "Tuỳ chỉnh", hiding under "Thao tác").
export const ChatInfo = ({
  viewer,
  userId,
  conversationId,
  peerName,
  selfName,
  initialProfile,
  chatEnabled,
  peerAvatarUrl,
  paths,
  preview,
}: ChatInfoProps) => {
  const t = useTranslations("chat.chatInfo");
  const isAdmin = viewer.role === "admin";
  const [profile, setProfile] = useState(initialProfile);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const presence = usePeerPresence({
    role: viewer.role,
    userId,
    fromThread: undefined,
  });
  const shownName = isAdmin
    ? displayNameFor(profile.nicknames, "user", peerName)
    : adminLabel(profile.nicknames, null, peerName, "pt");

  return (
    <>
      <AppHeader title={t("title")} backHref={paths.chat} />
      <main
        data-chat-info
        className={clsx(PAGE_CONTAINER, "space-y-8 pt-6 pb-12")}
      >
        <section
          aria-label={t("peerSection")}
          className="flex flex-col items-center gap-2 text-center"
        >
          {peerAvatarUrl ? (
            <button
              type="button"
              onClick={() => setIsPhotoOpen(true)}
              aria-label={t("viewPhoto", { name: shownName })}
              className="rounded-full transition active:scale-95"
            >
              <Avatar
                name={shownName}
                src={peerAvatarUrl}
                className="size-28 text-4xl"
              />
            </button>
          ) : (
            <Avatar name={shownName} className="size-28 text-4xl" />
          )}
          <h2 className="text-xl font-bold text-fg" data-chat-info-name>
            {shownName}
          </h2>
          <PresenceStatus presence={presence} className="justify-center" />
        </section>

        <section aria-label={t("toolsSection")}>
          <ul className="flex items-start justify-center gap-8">
            <li className="flex w-20 flex-col items-center gap-1.5">
              <Link href={paths.search} className={ROUND_BUTTON}>
                <Search className="size-5" aria-hidden />
                <span className="sr-only">{t("search")}</span>
              </Link>
              <span aria-hidden className="text-xs font-medium text-fg">
                {t("search")}
              </span>
            </li>
            <li className="flex w-20 flex-col items-center gap-1.5">
              <button
                type="button"
                aria-expanded={isCustomizing}
                aria-controls="chat-customize"
                onClick={() => setIsCustomizing((current) => !current)}
                className={clsx(
                  ROUND_BUTTON,
                  isCustomizing && "bg-accent text-accent-fg",
                )}
              >
                <SlidersHorizontal className="size-5" aria-hidden />
                <span className="sr-only">{t("customize")}</span>
              </button>
              <span aria-hidden className="text-xs font-medium text-fg">
                {t("customize")}
              </span>
            </li>
          </ul>
        </section>

        {isCustomizing && (
          <section
            id="chat-customize"
            aria-label={t("customize")}
            className="rounded-2xl border border-line bg-surface p-4"
          >
            <ChatCustomizePanel
              viewer={viewer}
              conversationId={conversationId}
              peerName={peerName}
              selfName={selfName}
              profile={profile}
              onProfileChange={setProfile}
              chatEnabled={chatEnabled}
            />
          </section>
        )}

        <section aria-labelledby="chat-info-photos" className="space-y-3">
          <h2 id="chat-info-photos" className={SECTION_TITLE}>
            {t("photos")}
          </h2>
          {preview.length > 0 && (
            <ul
              data-chat-info-preview
              className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl"
            >
              {preview.map((photo) => (
                <li
                  key={photo.photoId}
                  className="relative aspect-square bg-line"
                >
                  <Link
                    href={paths.photos}
                    aria-label={t("photoOf", { label: photoLabel(photo) })}
                    className="absolute inset-0 block"
                  >
                    {/* A plain img: the route is cookie-authenticated. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      className="size-full object-cover"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={paths.photos}
            className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 text-base font-medium text-fg transition active:bg-line"
          >
            <span>{t("galleryLink")}</span>
            <span className="flex items-center gap-1 text-sm text-muted">
              {preview.length === 0 && t("noPhotos")}
              <ChevronRight className="size-5" aria-hidden />
            </span>
          </Link>
        </section>

        {isAdmin && (
          <section aria-labelledby="chat-info-display" className="space-y-3">
            <h2 id="chat-info-display" className={SECTION_TITLE}>
              {t("displaySection")}
            </h2>
            <NeutralColorsSwitch />
          </section>
        )}

        {isAdmin && (
          <section aria-labelledby="chat-info-actions" className="space-y-3">
            <h2 id="chat-info-actions" className={SECTION_TITLE}>
              {t("actionsSection")}
            </h2>
            <HideConversationButton conversationId={conversationId} />
          </section>
        )}
      </main>
      {peerAvatarUrl && (
        <AvatarLightbox
          isOpen={isPhotoOpen}
          onClose={() => setIsPhotoOpen(false)}
          src={peerAvatarUrl}
          name={shownName}
        />
      )}
    </>
  );
};
