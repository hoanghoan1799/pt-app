"use client";

import { ExternalLink, Play, Repeat } from "lucide-react";
import Image from "next/image";
import { type ReactNode, useState } from "react";

import { CARD } from "@/constants/styles";
import { YoutubePlayer } from "@/features/workouts/components/YoutubePlayer";
import type { Exercise } from "@/features/workouts/types/workout";
import { formatVolume } from "@/features/workouts/utils/exercise";
import {
  getYoutubeThumbnailUrl,
  getYoutubeWatchUrl,
} from "@/features/workouts/utils/youtube";

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  footer?: ReactNode;
}

// Shows a thumbnail until tapped so a day with many exercises doesn't load
// every YouTube player up front. A plain toggle, so no separate hook/view.
export const ExerciseCard = ({
  exercise,
  index,
  footer,
}: ExerciseCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const volume = formatVolume(exercise.sets, exercise.reps);

  return (
    <article className={`${CARD} overflow-hidden`}>
      <div className="relative aspect-video bg-black">
        {isPlaying ? (
          <YoutubePlayer
            videoId={exercise.youtubeId}
            title={exercise.title}
            isAutoplay
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsPlaying(true)}
            className="group absolute inset-0 size-full"
            aria-label={`Phát video ${exercise.title}`}
          >
            <Image
              src={getYoutubeThumbnailUrl(exercise.youtubeId)}
              alt=""
              fill
              sizes="(max-width: 512px) 100vw, 512px"
              className="object-cover opacity-90"
            />
            <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
            <span className="absolute top-1/2 left-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-black shadow-lg transition group-active:scale-95">
              <Play className="ml-1 size-7 fill-current" aria-hidden />
            </span>
            <span className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-sm font-bold text-white backdrop-blur">
              {index + 1}
            </span>
          </button>
        )}
      </div>
      <div className="space-y-2.5 p-4">
        <h3 className="text-[17px] leading-snug font-semibold text-fg">
          {exercise.title}
        </h3>
        {volume && (
          <p className="flex w-fit items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1 text-sm font-semibold text-accent">
            <Repeat className="size-4" aria-hidden />
            {volume}
          </p>
        )}
        {exercise.description && (
          <p className="text-[15px] leading-relaxed whitespace-pre-line text-muted">
            {exercise.description}
          </p>
        )}
        <a
          href={getYoutubeWatchUrl(exercise.youtubeId)}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-2 flex min-h-11 w-fit items-center gap-1.5 text-sm font-medium text-muted"
        >
          Mở trên YouTube
          <ExternalLink className="size-4" aria-hidden />
        </a>
      </div>
      {footer}
    </article>
  );
};
