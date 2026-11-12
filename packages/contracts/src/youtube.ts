export const YOUTUBE_ID_PATTERN = /^[\w-]{11}$/;

export const YOUTUBE_HOSTS = ["youtube.com", "youtube-nocookie.com"];
export const YOUTUBE_SHORT_HOST = "youtu.be";
export const YOUTUBE_PATH_PREFIXES = ["shorts", "embed", "live", "v"];

export const YOUTUBE_EMBED_BASE = "https://www.youtube-nocookie.com/embed/";
export const YOUTUBE_WATCH_BASE = "https://www.youtube.com/watch?v=";
export const YOUTUBE_THUMBNAIL_BASE = "https://i.ytimg.com/vi/";

const toUrl = (value: string) => {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
};

const getCandidateId = (url: URL) => {
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const [, first, second] = url.pathname.split("/");

  if (host === YOUTUBE_SHORT_HOST) {
    return first;
  }
  if (!YOUTUBE_HOSTS.includes(host)) {
    return null;
  }
  if (first === "watch") {
    return url.searchParams.get("v");
  }
  return YOUTUBE_PATH_PREFIXES.includes(first) ? second : null;
};

// Accepts watch, youtu.be, shorts, embed and live links (or a bare video id)
// and returns the 11-character video id, or null when it isn't YouTube.
export const parseYoutubeId = (input: string) => {
  const value = input.trim();

  if (YOUTUBE_ID_PATTERN.test(value)) {
    return value;
  }

  const url = toUrl(value);
  const candidate = url ? getCandidateId(url) : null;

  return candidate && YOUTUBE_ID_PATTERN.test(candidate) ? candidate : null;
};

// playsinline keeps iPhone Safari from forcing fullscreen playback.
export const getYoutubeEmbedUrl = (videoId: string, isAutoplay = false) =>
  `${YOUTUBE_EMBED_BASE}${videoId}?playsinline=1&rel=0${isAutoplay ? "&autoplay=1" : ""}`;

export const getYoutubeWatchUrl = (videoId: string) =>
  `${YOUTUBE_WATCH_BASE}${videoId}`;

export const getYoutubeThumbnailUrl = (videoId: string) =>
  `${YOUTUBE_THUMBNAIL_BASE}${videoId}/hqdefault.jpg`;
