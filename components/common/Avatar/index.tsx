"use client";

import clsx from "clsx";
import { useState } from "react";

import { initialsOf } from "@/utils/name";

interface AvatarProps {
  // Real or shown name; its initials fill in when there is no photo.
  name: string | null;
  // Versioned /api/avatar URL, or null/undefined for initials only.
  src?: string | null;
  // Size and text size, e.g. "size-9 text-sm".
  className?: string;
  // "solid": accent fill (headers); "soft": tinted (lists, bubbles).
  tone?: "solid" | "soft";
}

// Round avatar: the photo over an initials fallback. A photo that fails to
// load (deleted meanwhile, not allowed) simply leaves the initials.
export const Avatar = ({
  name,
  src = null,
  className = "size-9 text-sm",
  tone = "solid",
}: AvatarProps) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <span
      aria-hidden
      data-avatar
      className={clsx(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold",
        tone === "solid"
          ? "bg-accent text-accent-fg"
          : "bg-accent/15 text-accent",
        className,
      )}
    >
      {initialsOf(name)}
      {showImage && src && (
        // A plain img: the route is cookie-authenticated and already sized,
        // so the image optimizer (which would fetch without cookies) is out.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          data-avatar-image
          draggable={false}
          onError={() => setFailedSrc(src)}
          className="absolute inset-0 size-full object-cover"
        />
      )}
    </span>
  );
};
