import type { SendContent } from "@/features/chat/hooks/use-chat-messages";

// The action input for a text, a sticker or a photos send.
export const contentInput = (content: SendContent) => {
  if ("sticker" in content) {
    return { sticker: content.sticker.input };
  }
  if ("photos" in content) {
    return {
      photoIds: content.photos.map((photo) => photo.photoId),
      body: content.body,
    };
  }
  return content;
};
