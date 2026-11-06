"use client";

import clsx from "clsx";
import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { type ChangeEvent, useRef, useState } from "react";

import type {
  CustomStickerItem,
  CustomStickersStatus,
} from "@/features/chat/hooks/use-custom-stickers";
import {
  CUSTOM_STICKER_MAX_PER_OWNER,
  STICKER_ALT_CUSTOM,
} from "@/features/chat/utils/custom-sticker-rules";

const LONG_PRESS_MS = 500;
const CELL =
  "relative flex aspect-square items-center justify-center rounded-xl p-1.5 transition active:scale-90 active:bg-line motion-reduce:transition-none motion-reduce:active:scale-100 select-none [-webkit-touch-callout:none]";

interface CustomStickerGridProps {
  stickers: CustomStickerItem[];
  status: CustomStickersStatus;
  isBusy: boolean;
  error: string | null;
  onAdd: (file: File) => void;
  onRemove: (id: number) => void;
  onPick: (sticker: CustomStickerItem) => void;
}

// The "Của tôi" tab of the sticker panel (KAN-158): an "add photo" tile and my
// own stickers. Tap sends; a long press (or the "Sửa" toggle) shows a delete
// badge on each one.
export const CustomStickerGrid = ({
  stickers,
  status,
  isBusy,
  error,
  onAdd,
  onRemove,
  onPick,
}: CustomStickerGridProps) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);
  const [isEditing, setIsEditing] = useState(false);
  const isFull = stickers.length >= CUSTOM_STICKER_MAX_PER_OWNER;

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    // Reset so picking the same photo again still fires a change.
    event.target.value = "";
    if (file) {
      onAdd(file);
    }
  };

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = () => {
    didLongPress.current = false;
    clearPress();
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setIsEditing(true);
    }, LONG_PRESS_MS);
  };

  const tap = (sticker: CustomStickerItem) => {
    if (didLongPress.current) {
      didLongPress.current = false;
      return;
    }
    if (!isEditing) {
      onPick(sticker);
    }
  };

  return (
    <>
      <div className="col-span-full flex items-center justify-between px-1 pb-1">
        <p className="text-xs text-muted">
          {stickers.length}/{CUSTOM_STICKER_MAX_PER_OWNER} sticker
        </p>
        {stickers.length > 0 && (
          <button
            type="button"
            aria-pressed={isEditing}
            onClick={() => setIsEditing((current) => !current)}
            className="min-h-10 rounded-full px-3 text-sm font-semibold text-accent"
          >
            {isEditing ? "Xong" : "Sửa"}
          </button>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        aria-label="Chọn ảnh làm sticker"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFile}
      />
      <button
        type="button"
        disabled={isBusy || isFull}
        onClick={() => fileInput.current?.click()}
        className={clsx(
          CELL,
          "flex-col gap-1 border border-dashed border-line text-xs font-semibold text-muted disabled:opacity-50",
        )}
      >
        {isBusy ? (
          <Loader2 className="size-6 animate-spin motion-reduce:animate-none" />
        ) : (
          <ImagePlus className="size-6" aria-hidden />
        )}
        {isBusy ? "Đang xử lý…" : "Thêm ảnh"}
      </button>
      {stickers.map((sticker) => (
        <div key={sticker.id} className="relative">
          <button
            type="button"
            aria-label={STICKER_ALT_CUSTOM}
            data-custom-sticker={sticker.id}
            onPointerDown={startPress}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => tap(sticker)}
            className={clsx(
              CELL,
              "w-full",
              isEditing && "animate-pulse motion-reduce:animate-none",
            )}
          >
            <Image
              src={sticker.url}
              alt=""
              width={64}
              height={64}
              unoptimized
              draggable={false}
              className="size-full object-contain"
            />
          </button>
          {isEditing && (
            <button
              type="button"
              aria-label="Xoá sticker này"
              onClick={() => onRemove(sticker.id)}
              className="absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-danger text-white shadow"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="col-span-full px-2 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {status === "loading" && (
        <p
          role="status"
          className="col-span-full px-2 py-6 text-center text-sm text-muted"
        >
          Đang tải sticker…
        </p>
      )}
      {status === "error" && (
        <p
          role="status"
          className="col-span-full px-2 py-6 text-center text-sm text-muted"
        >
          Không tải được sticker của bạn. Thử lại nhé.
        </p>
      )}
      {status === "ready" && stickers.length === 0 && (
        <p
          role="status"
          className="col-span-full px-2 py-6 text-center text-sm text-muted"
        >
          Chọn một ảnh từ thư viện để tạo sticker riêng.
        </p>
      )}
    </>
  );
};
