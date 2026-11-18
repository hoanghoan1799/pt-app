"use client";

import clsx from "clsx";

export interface GridPhoto {
  id: number;
  src: string;
  width: number;
  height: number;
}

interface PhotoGridProps {
  photos: GridPhoto[];
  // Called with the index (in `photos`) of the tapped tile.
  onOpen: (index: number) => void;
  // Accessible name of the image and of its button, e.g. "Photo 2 by Linh".
  labelFor: (index: number) => string;
  // Accessible name of the "+N" tile: how many photos are hidden behind it.
  moreLabelFor: (hidden: number) => string;
  className?: string;
}

// At most this many tiles are drawn; the rest is the "+N" overlay.
const MAX_TILES = 4;

const TILE =
  "relative block min-h-11 min-w-11 overflow-hidden bg-line focus-visible:outline-2 focus-visible:outline-accent";

// Facebook-style photo grid: 1 photo full width (its own aspect, height
// capped), 2 side by side, 3 = one tall tile and two stacked, 4 = 2x2, more
// than 4 = 2x2 with "+N" on the last tile. Every layout has a fixed aspect
// ratio, so nothing moves when the images arrive; images load lazily. Used by
// posts, chat and DM bubbles.
export const PhotoGrid = ({
  photos,
  onOpen,
  labelFor,
  moreLabelFor,
  className,
}: PhotoGridProps) => {
  if (photos.length === 0) {
    return null;
  }
  if (photos.length === 1) {
    const [photo] = photos;

    return (
      <div className={clsx("overflow-hidden rounded-xl", className)}>
        <button
          type="button"
          onClick={() => onOpen(0)}
          aria-label={labelFor(0)}
          className={clsx(TILE, "max-h-[32rem] w-full")}
          style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.src}
            alt={labelFor(0)}
            width={photo.width}
            height={photo.height}
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        </button>
      </div>
    );
  }
  const tiles = photos.slice(0, MAX_TILES);
  const hidden = photos.length - MAX_TILES;

  return (
    <div
      className={clsx(
        "grid gap-0.5 overflow-hidden rounded-xl",
        "grid-cols-2",
        photos.length === 2 ? "aspect-2/1" : "aspect-square grid-rows-2",
        className,
      )}
    >
      {tiles.map((photo, index) => {
        const isMore = hidden > 0 && index === MAX_TILES - 1;

        return (
          <button
            key={photo.id}
            type="button"
            onClick={() => onOpen(index)}
            aria-label={isMore ? moreLabelFor(hidden) : labelFor(index)}
            className={clsx(
              TILE,
              photos.length === 3 && index === 0 && "row-span-2",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.src}
              alt={isMore ? "" : labelFor(index)}
              width={photo.width}
              height={photo.height}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 size-full object-cover"
            />
            {isMore && (
              <span
                aria-hidden
                className="absolute inset-0 flex items-center justify-center bg-black/55 text-2xl font-semibold text-white"
              >
                +{hidden}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
