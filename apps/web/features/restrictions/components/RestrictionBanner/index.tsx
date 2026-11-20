import { Ban } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RestrictionSummary } from "@/features/restrictions/components/RestrictionSummary";
import type { ActiveRestriction } from "@/features/restrictions/types/restriction";

interface RestrictionBannerProps {
  restriction: ActiveRestriction;
}

// Shown at the top of every signed-in trainee page while they are restricted.
// (A suspended trainee never gets here: they are signed out.)
export const RestrictionBanner = async ({
  restriction,
}: RestrictionBannerProps) => {
  const t = await getTranslations("restrictions.banner");

  return (
    <div
      role="status"
      className="flex items-start gap-3 border-b border-danger/30 bg-danger/10 px-4 py-3"
    >
      <Ban className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-bold text-danger">{t("title")}</p>
        <p className="text-sm text-fg">{t("hint")}</p>
        <RestrictionSummary restriction={restriction} isTitleShown={false} />
      </div>
    </div>
  );
};
