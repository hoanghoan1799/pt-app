import { Video } from "lucide-react";
import { useTranslations } from "next-intl";

import { YoutubePlayer } from "@/features/workouts/components/YoutubePlayer";

interface YoutubePreviewProps {
  videoId: string | null;
  title: string;
}

export const YoutubePreview = ({ videoId, title }: YoutubePreviewProps) => {
  const t = useTranslations("workouts.youtubePreview");

  return (
    <div className="relative aspect-video overflow-hidden rounded-xl border border-line bg-surface">
      {videoId ? (
        <YoutubePlayer
          key={videoId}
          videoId={videoId}
          title={title || t("defaultTitle")}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-2 text-muted">
          <Video className="size-8" aria-hidden />
          <p className="text-sm">{t("pasteLink")}</p>
        </div>
      )}
    </div>
  );
};
