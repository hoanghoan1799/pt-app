"use client";

import clsx from "clsx";
import { useState } from "react";

import { bubbleBox, type ChatPhoto } from "@/features/chat/utils/photo-rules";

interface ChatPhotoImageProps {
  photo: ChatPhoto;
  // The bubble is still being sent.
  isDimmed?: boolean;
}

// A photo inside a bubble (KAN-160): at most 240 px wide, and the box has the
// stored aspect ratio before the image arrives, so the thread does not jump.
// A soft pulse stands in until the bytes are loaded. A plain img: the route is
// cookie-authenticated and the picture is already resized, so there is
// nothing for next/image to do.
export const ChatPhotoImage = ({
  photo,
  isDimmed = false,
}: ChatPhotoImageProps) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const box = bubbleBox(photo.width, photo.height);

  return (
    <span
      className={clsx(
        "relative block overflow-hidden rounded-[1rem] bg-line",
        !isLoaded && "animate-pulse",
        isDimmed && "opacity-70",
      )}
      style={{
        width: box.width,
        aspectRatio: `${photo.width} / ${photo.height}`,
        maxWidth: "100%",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={(node) => {
          // A cached image can finish before React attaches onLoad.
          if (node?.complete && node.naturalWidth > 0) {
            setIsLoaded(true);
          }
        }}
        src={photo.url}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        draggable={false}
        decoding="async"
        onLoad={() => setIsLoaded(true)}
        className={clsx(
          "pointer-events-none size-full object-cover transition duration-300",
          isLoaded ? "scale-100 blur-0" : "scale-105 blur-md",
        )}
      />
    </span>
  );
};
