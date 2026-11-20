import { useTranslations } from "next-intl";

import type { RestrictionLevel } from "@/features/restrictions/types/restriction";

interface RestrictionBadgeProps {
  level: RestrictionLevel;
}

// "Bị hạn chế" / "Bị khoá" next to a trainee in the admin list.
export const RestrictionBadge = ({ level }: RestrictionBadgeProps) => {
  const t = useTranslations("restrictions.badge");

  return (
    <span className="shrink-0 rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
      {t(level)}
    </span>
  );
};
