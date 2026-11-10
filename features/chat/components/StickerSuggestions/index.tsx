"use client";

import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { PickedSticker } from "@/features/chat/components/StickerPanel";
import {
  bundledStickerUrl,
  STICKER_PACK_ID,
} from "@/features/chat/constants/stickers";
import { useGiphySuggestions } from "@/features/chat/hooks/use-giphy-suggestions";
import {
  addRecentSticker,
  loadRecentStickers,
  saveRecentStickers,
} from "@/features/chat/utils/recent-stickers";
import {
  getGiphySuggestQuery,
  matchStickerSuggestions,
} from "@/features/chat/utils/sticker-suggestions";

interface StickerSuggestionsProps {
  // What is typed in the composer.
  text: string;
  // Asks GIPHY too (the per-device GIF switch).
  withGifs: boolean;
  // Sends the sticker; the composer clears the text.
  onPick: (sticker: PickedSticker) => void;
  onDismiss: () => void;
}

const LOCAL_DEBOUNCE_MS = 120;
const SKELETON_COUNT = 4;
const TILE =
  "relative flex size-14 shrink-0 items-center justify-center rounded-xl p-1 transition active:scale-90 active:bg-line motion-reduce:transition-none motion-reduce:active:scale-100";

// The row above the chat input: stickers (and GIFs) that match what is being
// typed. Local matches are instant (after a short debounce); GIFs are appended
// when they arrive, with skeleton tiles at the end meanwhile, so the local
// ones never jump. Renders nothing when there is nothing to show.
export const StickerSuggestions = ({
  text,
  withGifs,
  onPick,
  onDismiss,
}: StickerSuggestionsProps) => {
  const t = useTranslations("chat.stickerSuggest");
  const locale = useLocale();
  // Read once when the row first appears (it only mounts on the client).
  const [recent] = useState(loadRecentStickers);
  const [debouncedText, setDebouncedText] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedText(text), LOCAL_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  const recentIds = recent.flatMap((item) =>
    item.kind === "pack" ? [item.id] : [],
  );
  const local = matchStickerSuggestions(debouncedText, locale, recentIds);
  const giphy = useGiphySuggestions(
    withGifs ? getGiphySuggestQuery(text) : null,
  );
  const gifs = giphy.stickers;

  if (local.length === 0 && gifs.length === 0) {
    return null;
  }

  const send = (sticker: PickedSticker) => {
    const { input } = sticker;

    if (!("customId" in input)) {
      saveRecentStickers(
        addRecentSticker(
          loadRecentStickers(),
          "pack" in input
            ? { kind: "pack", pack: input.pack, id: input.id }
            : {
                kind: "giphy",
                giphyId: input.giphyId,
                url: input.url,
                alt: sticker.display.alt,
              },
        ),
      );
    }
    onPick(sticker);
  };

  return (
    <div className="mx-3 mb-1 rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 px-3 pt-1.5 text-xs text-muted">
        <span className="font-semibold">{t("title")}</span>
        <span className="flex items-center gap-3">
          {gifs.length > 0 && (
            <span className="font-semibold">Powered by GIPHY</span>
          )}
          <button
            type="button"
            tabIndex={-1}
            // Keep focus (and the keyboard) in the textarea.
            onMouseDown={(event) => event.preventDefault()}
            onClick={onDismiss}
            className="min-h-8 px-1 font-semibold active:text-fg"
          >
            {t("hide")}
          </button>
        </span>
      </div>
      <div
        role="group"
        aria-label={t("label")}
        className="flex items-center gap-1 overflow-x-auto overscroll-x-contain px-2 pt-0.5 pb-2"
      >
        {local.map((sticker) => {
          const url = bundledStickerUrl(STICKER_PACK_ID, sticker.id);

          return (
            <button
              key={sticker.id}
              type="button"
              aria-label={t("send", { alt: sticker.alt })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                send({
                  input: { pack: STICKER_PACK_ID, id: sticker.id },
                  display: { kind: "pack", url, alt: sticker.alt },
                })
              }
              className={TILE}
            >
              <Image
                src={url}
                alt=""
                width={48}
                height={48}
                unoptimized
                draggable={false}
                className="size-full object-contain"
              />
            </button>
          );
        })}
        {local.length > 0 && (gifs.length > 0 || giphy.isLoading) && (
          <span aria-hidden className="mx-1 h-8 w-px shrink-0 bg-line" />
        )}
        {giphy.isLoading &&
          Array.from({ length: SKELETON_COUNT }, (_, index) => (
            <span
              key={index}
              aria-hidden
              className="size-14 shrink-0 animate-pulse rounded-xl bg-line motion-reduce:animate-none"
            />
          ))}
        {gifs.map((gif) => (
          <button
            key={gif.giphyId}
            type="button"
            aria-label={t("send", { alt: gif.alt || "GIF" })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() =>
              send({
                input: { giphyId: gif.giphyId, url: gif.url },
                display: { kind: "giphy", url: gif.url, alt: gif.alt },
              })
            }
            className={TILE}
          >
            <Image
              src={gif.previewUrl}
              alt=""
              width={48}
              height={48}
              unoptimized
              draggable={false}
              className="size-full object-contain"
            />
            <span
              aria-hidden
              className="absolute right-0.5 bottom-0.5 rounded bg-fg/70 px-1 text-[10px] leading-4 font-bold text-bg"
            >
              GIF
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};
