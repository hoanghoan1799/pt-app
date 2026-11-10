"use client";

import clsx from "clsx";
import { Search } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { Input } from "@/components/common/Input";
import { CustomStickerGrid } from "@/features/chat/components/CustomStickerGrid";
import {
  bundledStickerUrl,
  STICKER_GROUPS,
  STICKER_PACK_ID,
} from "@/features/chat/constants/stickers";
import type { SendContent } from "@/features/chat/hooks/use-chat-messages";
import { useCustomStickers } from "@/features/chat/hooks/use-custom-stickers";
import { useGiphyStickers } from "@/features/chat/hooks/use-giphy-stickers";
import { useStickerSuggestSetting } from "@/features/chat/hooks/use-sticker-suggest-setting";
import {
  customStickerUrl,
  STICKER_ALT_CUSTOM,
} from "@/features/chat/utils/custom-sticker-rules";
import {
  addRecentSticker,
  loadRecentStickers,
  type RecentSticker,
  recentStickerKey,
  recentStickerView,
  saveRecentStickers,
} from "@/features/chat/utils/recent-stickers";

export type PickedSticker = Extract<
  SendContent,
  { sticker: unknown }
>["sticker"];

interface StickerPanelProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Tapping a sticker sends it right away.
  onPick: (sticker: PickedSticker) => void;
  // Whose personal stickers the "Của tôi" tab shows.
  role: "user" | "admin";
}

const GIPHY_TAB = "giphy";
const MINE_TAB = "mine";
const RECENT_TAB = "recent";
const TAB =
  "min-h-10 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition active:scale-95 motion-reduce:transition-none motion-reduce:active:scale-100";
const CELL =
  "flex aspect-square items-center justify-center rounded-xl p-1.5 transition active:scale-90 active:bg-line motion-reduce:transition-none motion-reduce:active:scale-100";

// A small checkbox row for a per-device suggestion switch.
const SuggestSwitch = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="flex min-h-8 cursor-pointer items-center gap-2 text-xs text-muted">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="size-4 accent-accent"
    />
    {label}
  </label>
);

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
  role,
}: StickerPanelProps) => {
  const t = useTranslations("chat.stickerPanel");
  // Read once when the panel mounts (it only mounts on the client, on demand).
  const [recent, setRecent] = useState<RecentSticker[]>(loadRecentStickers);
  const [tab, setTab] = useState<string>(() =>
    recent.length > 0 ? RECENT_TAB : STICKER_GROUPS[0].key,
  );
  const [query, setQuery] = useState("");
  const giphy = useGiphyStickers(query);
  const mine = useCustomStickers(role);
  const showGiphy = giphy.enabled === true;
  // The tab disappears if the key goes away; fall back to the first group.
  const activeTab =
    tab === GIPHY_TAB && !showGiphy ? STICKER_GROUPS[0].key : tab;
  const group = STICKER_GROUPS.find((item) => item.key === activeTab);
  const isLoading = giphy.status === "loading" || giphy.isSearching;

  const showRecent = recent.length > 0;
  const [suggestStickers, setSuggestStickers] =
    useStickerSuggestSetting("stickers");
  const [suggestGifs, setSuggestGifs] = useStickerSuggestSetting("gifs");

  const pick = (sticker: PickedSticker) => {
    const { input } = sticker;

    // Personal stickers have their own tab, so they skip "Gần đây".
    if (!("customId" in input)) {
      const entry: RecentSticker =
        "pack" in input
          ? { kind: "pack", pack: input.pack, id: input.id }
          : {
              kind: "giphy",
              giphyId: input.giphyId,
              url: input.url,
              alt: sticker.display.alt,
            };
      const next = addRecentSticker(recent, entry);

      setRecent(next);
      // The next opening starts on what was just sent.
      setTab(RECENT_TAB);
      saveRecentStickers(next);
    }
    onOpenChange(false);
    onPick(sticker);
  };

  return (
    <BottomSheet
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Sticker"
      description={t("description")}
    >
      <div
        role="tablist"
        aria-label={t("groupsLabel")}
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3"
      >
        {showRecent && (
          <button
            type="button"
            role="tab"
            id={`sticker-tab-${RECENT_TAB}`}
            aria-selected={activeTab === RECENT_TAB}
            aria-controls="sticker-grid"
            onClick={() => setTab(RECENT_TAB)}
            className={clsx(
              TAB,
              activeTab === RECENT_TAB
                ? "border-accent bg-accent text-accent-fg"
                : "border-line bg-surface text-fg",
            )}
          >
            {t("recent")}
          </button>
        )}
        <button
          type="button"
          role="tab"
          id={`sticker-tab-${MINE_TAB}`}
          aria-selected={activeTab === MINE_TAB}
          aria-controls="sticker-grid"
          onClick={() => setTab(MINE_TAB)}
          className={clsx(
            TAB,
            activeTab === MINE_TAB
              ? "border-accent bg-accent text-accent-fg"
              : "border-line bg-surface text-fg",
          )}
        >
          {t("mine")}
        </button>
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
            {t(`groups.${item.key}`)}
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
        <Input
          type="search"
          clearable
          leadingIcon={<Search className="size-5" aria-hidden />}
          wrapperClassName="mb-3"
          value={query}
          maxLength={50}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("giphySearch")}
          aria-label={t("giphySearch")}
        />
      )}
      <div
        id="sticker-grid"
        role="tabpanel"
        aria-labelledby={`sticker-tab-${activeTab}`}
        data-sticker-grid={activeTab}
        className="grid h-[42dvh] min-h-48 grid-cols-4 content-start gap-1 overflow-y-auto overscroll-contain"
      >
        {activeTab === RECENT_TAB &&
          recent.map((item) => {
            const view = recentStickerView(item);

            return (
              <button
                key={recentStickerKey(item)}
                type="button"
                aria-label={view.alt}
                onClick={() =>
                  pick(
                    item.kind === "pack"
                      ? {
                          input: { pack: item.pack, id: item.id },
                          display: { kind: "pack", ...view },
                        }
                      : {
                          input: { giphyId: item.giphyId, url: item.url },
                          display: { kind: "giphy", ...view },
                        },
                  )
                }
                className={CELL}
              >
                <Image
                  src={view.url}
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
        {activeTab === MINE_TAB && (
          <CustomStickerGrid
            stickers={mine.stickers}
            status={mine.status}
            isBusy={mine.isBusy}
            error={mine.error}
            onAdd={(file) => void mine.add(file)}
            onRemove={(id) => void mine.remove(id)}
            onPick={(sticker) =>
              pick({
                input: { customId: sticker.id },
                display: {
                  kind: "custom",
                  url: customStickerUrl(sticker.id),
                  alt: STICKER_ALT_CUSTOM,
                },
              })
            }
          />
        )}
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
          <StateText>{t("loading")}</StateText>
        )}
        {activeTab === GIPHY_TAB && !isLoading && giphy.status === "error" && (
          <StateText>
            {giphy.error === "rate_limited"
              ? t("rateLimited")
              : t("giphyError")}
          </StateText>
        )}
        {activeTab === GIPHY_TAB &&
          !isLoading &&
          giphy.status === "ready" &&
          giphy.stickers.length === 0 && (
            <StateText>{t("giphyEmpty")}</StateText>
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
      <div className="mt-2 flex flex-wrap gap-x-4 border-t border-line pt-2">
        <SuggestSwitch
          label={t("suggestStickers")}
          checked={suggestStickers}
          onChange={setSuggestStickers}
        />
        <SuggestSwitch
          label={t("suggestGifs")}
          checked={suggestGifs}
          onChange={setSuggestGifs}
        />
      </div>
    </BottomSheet>
  );
};
