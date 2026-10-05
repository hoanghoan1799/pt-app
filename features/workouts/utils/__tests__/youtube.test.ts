import { describe, expect, it } from "vitest";

import { parseYoutubeId } from "@/features/workouts/utils/youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeId", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube-nocookie.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}`,
    `youtube.com/watch?v=${ID}`,
    `  ${ID}  `,
  ])("parses %s", (input) => {
    expect(parseYoutubeId(input)).toBe(ID);
  });

  it.each([
    "",
    "hello",
    "https://vimeo.com/123456",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/channel/UC123",
    `https://notyoutube.com/watch?v=${ID}`,
  ])("rejects %s", (input) => {
    expect(parseYoutubeId(input)).toBeNull();
  });
});
