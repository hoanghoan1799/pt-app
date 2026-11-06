// Bundled sticker pack (KAN-144): Microsoft Fluent Emoji, Flat style, MIT
// licence (public/stickers/fluent/LICENSE). Files live in
// public/stickers/<pack>/<id>.svg. Ids are unique across the whole manifest
// because a stored ref is "pack:<id>".

export const STICKER_PACK_ID = "fluent";
export const STICKER_PACK_NAME = "Microsoft Fluent Emoji";

export interface BundledSticker {
  id: string;
  // Vietnamese alt text for screen readers.
  alt: string;
}

export interface StickerGroup {
  key: "workout" | "food" | "mood";
  label: string;
  stickers: BundledSticker[];
}

export const STICKER_GROUPS: StickerGroup[] = [
  {
    key: "workout",
    label: "Tập luyện",
    stickers: [
      { id: "flexed-biceps", alt: "Cơ bắp" },
      { id: "person-lifting-weights", alt: "Nâng tạ" },
      { id: "running-shoe", alt: "Giày chạy bộ" },
      { id: "stopwatch", alt: "Đồng hồ bấm giờ" },
      { id: "trophy", alt: "Cúp" },
      { id: "1st-place-medal", alt: "Huy chương vàng" },
      { id: "bullseye", alt: "Trúng đích" },
      { id: "fire", alt: "Lửa" },
      { id: "rocket", alt: "Tên lửa" },
    ],
  },
  {
    key: "food",
    label: "Ăn uống",
    stickers: [
      { id: "green-salad", alt: "Salad" },
      { id: "avocado", alt: "Bơ" },
      { id: "banana", alt: "Chuối" },
      { id: "broccoli", alt: "Bông cải xanh" },
      { id: "cut-of-meat", alt: "Thịt" },
      { id: "droplet", alt: "Giọt nước" },
      { id: "carrot", alt: "Cà rốt" },
      { id: "strawberry", alt: "Dâu tây" },
      { id: "glass-of-milk", alt: "Ly sữa" },
    ],
  },
  {
    key: "mood",
    label: "Cảm xúc",
    stickers: [
      { id: "smiling-face-with-hearts", alt: "Mặt cười với tim" },
      { id: "face-with-tears-of-joy", alt: "Cười ra nước mắt" },
      { id: "star-struck", alt: "Mắt sao" },
      { id: "smiling-face-with-sunglasses", alt: "Mặt cười đeo kính" },
      { id: "partying-face", alt: "Ăn mừng" },
      { id: "face-with-steam-from-nose", alt: "Hầm hầm" },
      { id: "exploding-head", alt: "Nổ đầu" },
      { id: "sleeping-face", alt: "Ngủ" },
      { id: "loudly-crying-face", alt: "Khóc to" },
      { id: "red-heart", alt: "Trái tim đỏ" },
      { id: "thumbs-up", alt: "Giơ ngón cái" },
      { id: "clapping-hands", alt: "Vỗ tay" },
      { id: "folded-hands", alt: "Chắp tay" },
    ],
  },
];

// pack id -> sticker id -> alt.
export const STICKER_PACKS: Record<string, Record<string, string>> = {
  [STICKER_PACK_ID]: Object.fromEntries(
    STICKER_GROUPS.flatMap((group) =>
      group.stickers.map((sticker) => [sticker.id, sticker.alt]),
    ),
  ),
};

export const bundledStickerUrl = (pack: string, id: string) =>
  `/stickers/${pack}/${id}.svg`;

// Own-property lookup so "constructor" or "__proto__" are never a pack/id.
export const findBundledSticker = (pack: string, id: string) => {
  const stickers = Object.hasOwn(STICKER_PACKS, pack)
    ? STICKER_PACKS[pack]
    : undefined;

  if (!stickers || !Object.hasOwn(stickers, id)) {
    return null;
  }
  return { pack, id, alt: stickers[id], url: bundledStickerUrl(pack, id) };
};
