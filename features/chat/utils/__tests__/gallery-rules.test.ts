import { describe, expect, it } from "vitest";

import {
  GALLERY_PAGE_SIZE,
  parseGalleryCursor,
  parseGalleryTab,
  photoFileName,
  photoLabel,
  stepIndex,
  stickerFileName,
} from "@/features/chat/utils/gallery-rules";

describe("parseGalleryCursor", () => {
  it("accepts no cursor and plain positive ids", () => {
    expect(parseGalleryCursor(null)).toEqual({ ok: true, before: undefined });
    expect(parseGalleryCursor("42")).toEqual({ ok: true, before: 42 });
  });

  it("rejects anything else", () => {
    for (const bad of ["", "0", "-5", "1e3", "0x10", " 5", "5.5", "abc"]) {
      expect(parseGalleryCursor(bad)).toEqual({ ok: false });
    }
  });

  it("pages by 60", () => {
    expect(GALLERY_PAGE_SIZE).toBe(60);
  });
});

describe("photoFileName", () => {
  it("names the file by id and real type", () => {
    expect(photoFileName(7, "image/webp")).toBe("pt-app-photo-7.webp");
    expect(photoFileName(7, "image/jpeg")).toBe("pt-app-photo-7.jpg");
    expect(photoFileName(7, "image/png")).toBe("pt-app-photo-7.png");
  });

  it("falls back to webp for an unknown or missing type", () => {
    expect(photoFileName(7, null)).toBe("pt-app-photo-7.webp");
    expect(photoFileName(7, "text/html")).toBe("pt-app-photo-7.webp");
  });
});

describe("photoLabel", () => {
  it("is the sender and the local date and time", () => {
    // 11:32 UTC is 18:32 in Ho Chi Minh City.
    expect(
      photoLabel({
        senderName: "An",
        createdAt: "2026-10-05T11:32:00.000Z",
      }),
    ).toBe("An · 05/10 18:32");
  });
});

describe("stepIndex", () => {
  it("moves one step and stops at both ends", () => {
    expect(stepIndex(1, 1, 3)).toBe(2);
    expect(stepIndex(2, 1, 3)).toBe(2);
    expect(stepIndex(0, -1, 3)).toBe(0);
    expect(stepIndex(1, -1, 3)).toBe(0);
    expect(stepIndex(0, 1, 0)).toBe(0);
  });
});

describe("parseGalleryTab", () => {
  it("knows the three tabs and falls back to photos", () => {
    expect(parseGalleryTab("stickers")).toBe("stickers");
    expect(parseGalleryTab("links")).toBe("links");
    expect(parseGalleryTab(["links", "stickers"])).toBe("links");
    for (const bad of [undefined, null, "", "Links", "x", ["nope"]]) {
      expect(parseGalleryTab(bad)).toBe("photos");
    }
  });
});

describe("stickerFileName", () => {
  it("follows the real type, GIF included", () => {
    expect(stickerFileName(5, "image/gif")).toBe("pt-app-sticker-5.gif");
    expect(stickerFileName(5, "image/png")).toBe("pt-app-sticker-5.png");
    expect(stickerFileName(5, "image/svg+xml")).toBe("pt-app-sticker-5.webp");
    expect(stickerFileName(5, null)).toBe("pt-app-sticker-5.webp");
  });
});
