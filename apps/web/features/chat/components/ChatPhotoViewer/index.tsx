"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { LazyPhotoViewer } from "@/components/common/LazyPhotoViewer";
import type { ViewerPhoto } from "@/components/common/PhotoViewer";
import { photoFileName } from "@/features/chat/utils/gallery-rules";
import {
  type ChatPhoto,
  photoIdOfUrl,
} from "@/features/chat/utils/photo-rules";

interface ChatPhotoViewerProps {
  photos: ChatPhoto[];
  // Index of the photo on screen, or null while closed.
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

// The full-screen viewer over the photos of one message (chat, group and DM):
// swipe or arrows between them, download for each.
export const ChatPhotoViewer = ({
  photos,
  index,
  onIndexChange,
  onClose,
}: ChatPhotoViewerProps) => {
  const t = useTranslations("chat.messageBubble");
  const viewerPhotos = useMemo<ViewerPhoto[]>(
    () =>
      photos.map((photo, position) => ({
        id: photoIdOfUrl(photo.url) || -(position + 1),
        src: photo.url,
        label: t("photoN", { index: position + 1, total: photos.length }),
      })),
    [photos, t],
  );

  return (
    <LazyPhotoViewer
      photos={viewerPhotos}
      index={index}
      onIndexChange={onIndexChange}
      onClose={onClose}
      fileNameFor={(photo, mime) => photoFileName(photo.id, mime)}
    />
  );
};
