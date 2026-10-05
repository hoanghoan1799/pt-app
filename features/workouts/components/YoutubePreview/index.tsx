import { Video } from "lucide-react";

import { YoutubePlayer } from "@/features/workouts/components/YoutubePlayer";

interface YoutubePreviewProps {
  videoId: string | null;
  title: string;
}

export const YoutubePreview = ({ videoId, title }: YoutubePreviewProps) => (
  <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-surface">
    {videoId ? (
      <YoutubePlayer
        key={videoId}
        videoId={videoId}
        title={title || "Xem trước video"}
      />
    ) : (
      <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
        <Video className="size-8" aria-hidden />
        <p className="text-sm">Dán link để xem trước video</p>
      </div>
    )}
  </div>
);
