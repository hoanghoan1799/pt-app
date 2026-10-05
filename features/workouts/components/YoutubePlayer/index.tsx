import { getYoutubeEmbedUrl } from "@/features/workouts/utils/youtube";

interface YoutubePlayerProps {
  videoId: string;
  title: string;
  isAutoplay?: boolean;
}

export const YoutubePlayer = ({
  videoId,
  title,
  isAutoplay = false,
}: YoutubePlayerProps) => (
  <iframe
    src={getYoutubeEmbedUrl(videoId, isAutoplay)}
    title={title}
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    referrerPolicy="strict-origin-when-cross-origin"
    allowFullScreen
    className="absolute inset-0 size-full border-0"
  />
);
