import { describe, expect, it } from "vitest";

import type { SendContent } from "@/features/chat/hooks/use-chat-messages";
import { contentInput } from "@/features/chat/utils/content-input";

const photo = (photoId: number) => ({
  photoId,
  blob: new Blob(["x"]),
  width: 10,
  height: 10,
});

describe("contentInput", () => {
  it("sends the photo ids in the order they were picked, with the caption", () => {
    const content: SendContent = {
      photos: [photo(7), photo(3), photo(9)],
      body: "bữa trưa",
    };

    expect(contentInput(content)).toEqual({
      photoIds: [7, 3, 9],
      body: "bữa trưa",
    });
  });

  it("keeps a text and a sticker as they are", () => {
    expect(contentInput({ body: "chào" })).toEqual({ body: "chào" });
    expect(
      contentInput({
        sticker: {
          input: { pack: "fluent", id: "fire" },
          display: { kind: "pack", url: "/s.svg", alt: "fire" },
        },
      } as SendContent),
    ).toEqual({ sticker: { pack: "fluent", id: "fire" } });
  });
});
