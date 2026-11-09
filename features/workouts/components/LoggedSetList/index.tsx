import { useTranslations } from "next-intl";

import { formatSet } from "@/features/workouts/utils/set-logger";
import type { LoggedSet } from "@/features/workouts/utils/sets";

interface LoggedSetListProps {
  sets: LoggedSet[];
}

// Read-only sets (Q13): the admin preview (E5) shows the empty fallback; the
// member page (F1) only renders it when sets exist.
export const LoggedSetList = ({ sets }: LoggedSetListProps) => {
  const t = useTranslations("workouts.loggedSets");

  return (
    <p className="border-t border-line px-4 py-3 text-sm text-muted">
      {sets.length > 0 ? (
        <>
          <span className="font-medium text-fg">{t("loggedPrefix")}</span>{" "}
          {sets.map(formatSet).join(" · ")}
        </>
      ) : (
        t("nothingLogged")
      )}
    </p>
  );
};
