import { useTranslations } from "next-intl";

import {
  DAY_STATUS_DOT_CLASSES,
  type WeekDayStatus,
} from "@/components/common/WeekDayTabs";

const LEGEND = ["complete", "partial"] as const satisfies WeekDayStatus[];

// Key for the green and orange day markers in the week calendar.
export const DayStatusLegend = () => {
  const t = useTranslations("common.dayStatus");

  return (
    <ul
      aria-label={t("legendLabel")}
      className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"
    >
      {LEGEND.map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={`size-2 rounded-full ${DAY_STATUS_DOT_CLASSES[status]}`}
          />
          {t(status)}
        </li>
      ))}
    </ul>
  );
};
