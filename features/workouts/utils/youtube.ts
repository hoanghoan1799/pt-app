import {
  YOUTUBE_EMBED_BASE,
  YOUTUBE_HOSTS,
  YOUTUBE_ID_PATTERN,
  YOUTUBE_PATH_PREFIXES,
  YOUTUBE_SHORT_HOST,
  YOUTUBE_THUMBNAIL_BASE,
  YOUTUBE_WATCH_BASE,
} from "@/features/workouts/constants/youtube";

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
