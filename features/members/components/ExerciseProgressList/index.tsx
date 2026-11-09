import { History, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { CARD } from "@/constants/styles";
import type { ExerciseProgressRow } from "@/features/members/types/progress";
import {
  describeBests,
  describeTrend,
  type TrendTone,
} from "@/features/members/utils/progress-text";

interface ExerciseProgressListProps {
  rows: ExerciseProgressRow[];
}

const TONE_STYLES: Record<TrendTone, string> = {
  up: "text-success",
  down: "text-warning",
  neutral: "text-muted",
};

const TONE_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  neutral: Minus,
} satisfies Record<TrendTone, typeof Minus>;

// "Tiến bộ" on the admin Summary tab: one row per exercise link, the selected
// week's best against the best before it (F4, Q8). Read-only.
export const ExerciseProgressList = ({ rows }: ExerciseProgressListProps) => {
  const locale = useLocale();
  const t = useTranslations("members.exerciseProgress");

  if (!rows.length) {
    return (
      <div className={`${CARD} flex items-start gap-3 px-4 py-5 text-sm`}>
        <History className="mt-0.5 size-5 shrink-0 text-muted" aria-hidden />
        <div>
          <p className="text-muted">{t("empty")}</p>
          <p className="mt-0.5 text-xs text-muted">{t("emptyHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
      {rows.map((row) => {
        const badge = describeTrend(row, locale);
        const Icon = TONE_ICONS[badge.tone];

        return (
          <li key={row.youtubeId} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <p className="min-w-0 flex-1 line-clamp-2 text-[15px] font-medium text-fg">
                {row.title}
              </p>
              <span
                className={`flex shrink-0 items-center gap-1 text-sm font-semibold ${TONE_STYLES[badge.tone]}`}
              >
                <Icon className="size-4" aria-hidden />
                {badge.label}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {describeBests(row, locale).map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </li>
        );
      })}
    </ul>
  );
};
