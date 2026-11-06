"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { INPUT } from "@/constants/styles";
import {
  bundledStickerUrl,
  STICKER_GROUPS,
  STICKER_PACK_ID,
} from "@/features/chat/constants/stickers";
import type { SendContent } from "@/features/chat/hooks/use-chat-messages";
import { useGiphyStickers } from "@/features/chat/hooks/use-giphy-stickers";

type PickedSticker = Extract<SendContent, { sticker: unknown }>["sticker"];

interface StickerPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Tapping a sticker sends it right away.
  onPick: (sticker: PickedSticker) => void;
}

const GIPHY_TAB = "giphy";
const TAB =
  "min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition active:scale-95";
const CELL =
  "flex aspect-square items-center justify-center rounded-xl p-1.5 transition active:scale-90 active:bg-line";

const StateText = ({ children }: { children: string }) => (
  <p
    role="status"
    className="col-span-full px-2 py-10 text-center text-sm text-muted"
  >
    {children}
  </p>
);

// The sticker picker, a bottom sheet over the thread: one tab per bundled
// group plus a GIPHY tab when the server has a key (KAN-145). Loaded on demand
// from the composer, so none of it is in the main chat bundle.
export const StickerPanel = ({
  isOpen,
  onOpenChange,
  onPick,
}: StickerPanelProps) => {
  const [tab, setTab] = useState<string>(STICKER_GROUPS[0].key);
  const [query, setQuery] = useState("");
  const giphy = useGiphyStickers(query);
  const showGiphy = giphy.enabled === true;
  // The tab disappears if the key goes away; fall back to the first group.
  const activeTab =
    tab === GIPHY_TAB && !showGiphy ? STICKER_GROUPS[0].key : tab;
  const group = STICKER_GROUPS.find((item) => item.key === activeTab);
  const isLoading = giphy.status === "loading" || giphy.isSearching;

  const pick = (sticker: PickedSticker) => {
    onOpenChange(false);
    onPick(sticker);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Sticker"
      description="Chọn một sticker để gửi ngay"
    >
      <div
        role="tablist"
        aria-label="Nhóm sticker"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3"
      >
        {STICKER_GROUPS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`sticker-tab-${item.key}`}
            aria-selected={activeTab === item.key}
            aria-controls="sticker-grid"
            onClick={() => setTab(item.key)}
            className={clsx(
              TAB,
              activeTab === item.key
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-surface text-fg",
            )}
          >
            {item.label}
          </button>
        ))}
        {showGiphy && (
          <button
            type="button"
            role="tab"
            id={`sticker-tab-${GIPHY_TAB}`}
            aria-selected={activeTab === GIPHY_TAB}
            aria-controls="sticker-grid"
            onClick={() => setTab(GIPHY_TAB)}
            className={clsx(
              TAB,
              activeTab === GIPHY_TAB
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-surface text-fg",
            )}
          >
            GIPHY
          </button>
        )}
      </div>
      {activeTab === GIPHY_TAB && (
        <div className="relative mb-3">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            maxLength={50}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm sticker trên GIPHY"
            aria-label="Tìm sticker trên GIPHY"
            className={clsx(INPUT, "pl-11")}
          />
        </div>
      )}
      <div
        id="sticker-grid"
        role="tabpanel"
        aria-labelledby={`sticker-tab-${activeTab}`}
        data-sticker-grid={activeTab}
        className="grid h-[42dvh] min-h-48 grid-cols-4 content-start gap-1 overflow-y-auto overscroll-contain"
      >
        {group?.stickers.map((sticker) => {
          const url = bundledStickerUrl(STICKER_PACK_ID, sticker.id);

          return (
            <button
              key={sticker.id}
              type="button"
              aria-label={sticker.alt}
              onClick={() =>
                pick({
                  input: { pack: STICKER_PACK_ID, id: sticker.id },
                  display: { kind: "pack", url, alt: sticker.alt },
                })
              }
              className={CELL}
            >
              <Image
                src={url}
                alt=""
                width={64}
                height={64}
                unoptimized
                draggable={false}
                className="size-full object-contain"
              />
            </button>
          );
        })}
        {activeTab === GIPHY_TAB && isLoading && (
          <StateText>Đang tải sticker…</StateText>
        )}
        {activeTab === GIPHY_TAB && !isLoading && giphy.status === "error" && (
          <StateText>
            {giphy.error === "rate_limited"
              ? "Bạn tìm hơi nhanh. Chờ một chút rồi thử lại nhé."
              : "Không tải được sticker GIPHY. Thử lại nhé."}
          </StateText>
        )}
        {activeTab === GIPHY_TAB &&
          !isLoading &&
          giphy.status === "ready" &&
          giphy.stickers.length === 0 && (
            <StateText>Không tìm thấy sticker nào.</StateText>
          )}
        {activeTab === GIPHY_TAB &&
          !isLoading &&
          giphy.stickers.map((sticker) => (
            <button
              key={sticker.giphyId}
              type="button"
              aria-label={sticker.alt}
              onClick={() =>
                pick({
                  input: { giphyId: sticker.giphyId, url: sticker.url },
                  display: {
                    kind: "giphy",
                    url: sticker.url,
                    alt: sticker.alt,
                  },
                })
              }
              className={CELL}
            >
              <Image
                src={sticker.previewUrl}
                alt=""
                width={96}
                height={96}
                unoptimized
                draggable={false}
                className="size-full object-contain"
              />
            </button>
          ))}
      </div>
      {activeTab === GIPHY_TAB && (
        <p className="mt-2 text-center text-xs font-semibold text-muted">
          Powered by GIPHY
        </p>
      )}
    </BottomSheet>
  );
};
