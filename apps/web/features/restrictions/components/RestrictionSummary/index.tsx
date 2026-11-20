import { useLocale, useTranslations } from "next-intl";

import { TIME_ZONE } from "@/constants/time";
import type { ActiveRestriction } from "@/features/restrictions/types/restriction";
import { parseLocale } from "@/utils/locale";
import { formatShortDateTime } from "@/utils/time";

interface RestrictionSummaryProps {
  restriction: ActiveRestriction;
  // Show the level as a title line (the admin card); the trainee banner has
  // its own headline.
  isTitleShown?: boolean;
}

// What an active restriction is: the level, when it ends (or permanent) and
// the reason. Shared by the trainee banner and the admin trainee page, on the
// server and in client components.
export const RestrictionSummary = ({
  restriction,
  isTitleShown = true,
}: RestrictionSummaryProps) => {
  const t = useTranslations("restrictions.summary");
  const locale = parseLocale(useLocale());

  return (
    <div className="space-y-0.5 text-sm">
      {isTitleShown && (
        <p className="font-semibold text-fg">
          {restriction.level === "suspended"
            ? t("titleSuspended")
            : t("titleRestricted")}
        </p>
      )}
      <p className="text-muted">
        {restriction.until === null
          ? t("permanent")
          : t("until", {
              until: formatShortDateTime(restriction.until, TIME_ZONE, locale),
            })}
      </p>
      <p className="break-words text-muted">
        {t("reason", { reason: restriction.reason })}
      </p>
    </div>
  );
};
