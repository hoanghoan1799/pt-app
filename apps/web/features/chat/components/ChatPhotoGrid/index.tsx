"use client";

import clsx from "clsx";
import { useTranslations } from "next-intl";
import { type RefObject, useRef } from "react";

import { PhotoGrid } from "@/components/common/PhotoGrid";
import {
  type ChatPhoto,
  PHOTO_BUBBLE_MAX_WIDTH,
  photoIdOfUrl,
} from "@/features/chat/utils/photo-rules";

interface ChatPhotoGridProps {
  photos: ChatPhoto[];
  // The bubble is still being sent.
  isDimmed?: boolean;
  // Written with the tapped tile when the tap came from a pointer: the bubble's
  // gesture opens the viewer once it knows the tap was not half a double-tap.
  // Without it every tap opens at once (a bubble with no gestures).
  tapIndexRef?: RefObject<number>;
  // A tap that is not a pointer one (the keyboard): open at once.
  onOpen: (index: number) => void;
}

// Several photos of one message as a grid inside the bubble (at most 240 px
// wide, 4 tiles and "+N"). Its tiles opt out of the bubble's "controls keep
// their own taps" rule (data-gesture-through), so double-tap and long-press
// keep working on the photos.
export const ChatPhotoGrid = ({
  photos,
  isDimmed = false,
  tapIndexRef,
  onOpen,
}: ChatPhotoGridProps) => {
  const t = useTranslations("chat.messageBubble");
  const viaPointer = useRef(false);

  return (
    <div
      data-gesture-through=""
      onPointerDownCapture={() => {
        viaPointer.current = true;
      }}
      className={clsx(isDimmed && "opacity-70")}
      style={{ width: PHOTO_BUBBLE_MAX_WIDTH, maxWidth: "100%" }}
    >
      <PhotoGrid
        photos={photos.map((photo, index) => ({
          // A photo still being sent has a local URL without an id.
          id: photoIdOfUrl(photo.url) || -(index + 1),
          src: photo.url,
          width: photo.width,
          height: photo.height,
        }))}
        onOpen={(index) => {
          if (tapIndexRef && viaPointer.current) {
            viaPointer.current = false;
            tapIndexRef.current = index;
            return;
          }
          onOpen(index);
        }}
        labelFor={(index) =>
          t("photoN", { index: index + 1, total: photos.length })
        }
        moreLabelFor={(hidden) => t("morePhotos", { count: hidden })}
        className="rounded-[1rem]"
      />
    </div>
  );
};
