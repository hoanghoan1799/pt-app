import { CornerDownLeft, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { ICON_BUTTON } from "@/constants/styles";
import {
  formatSet,
  type SetRowDraft,
  type SetRowField,
} from "@/features/workouts/utils/set-logger";
import type { LoggedSet } from "@/features/workouts/utils/sets";

interface SetInputRowProps {
  index: number;
  row: SetRowDraft;
  // The PT's target, e.g. "8-12", shown as the reps placeholder (E2).
  targetReps: string;
  canRemove: boolean;
  isDisabled: boolean;
  onChange: (id: number, field: SetRowField, value: string) => void;
  onRemove: (id: number) => void;
  // The previous session's set at this row position, if any (E7).
  hint: LoggedSet | null;
  onApplyHint: (id: number, hint: LoggedSet) => void;
}

// `INPUT` with less padding and centred text, so two inputs and the delete
// button fit a 390 px phone without horizontal scroll. Copied rather than
// composed: without tailwind-merge, `px-2` next to INPUT's `px-4` is not
// guaranteed to win.
const SET_INPUT =
  "block min-h-12 w-full min-w-0 rounded-xl border border-line bg-surface px-2 text-center text-base text-fg tabular-nums placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-60";

export const SetInputRow = ({
  index,
  row,
  targetReps,
  canRemove,
  isDisabled,
  onChange,
  onRemove,
  hint,
  onApplyHint,
}: SetInputRowProps) => {
  const locale = useLocale();
  const t = useTranslations("workouts.setInputRow");
  const setNumber = index + 1;
  const hintText = hint ? formatSet(hint, locale) : "";

  return (
    <li className="grid grid-cols-[1.75rem_1fr_1fr_2.75rem] items-center gap-2">
      <span className="text-center text-sm font-semibold text-muted tabular-nums">
        {setNumber}
      </span>
      {/* Text, not number: Vietnamese keyboards type "42,5", which a number
          input reports as empty. The 0.5 kg step is checked on save. */}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        enterKeyHint="next"
        value={row.weight}
        onChange={(event) => onChange(row.id, "weight", event.target.value)}
        placeholder={t("weightPlaceholder")}
        aria-label={t("weightLabel", { set: setNumber })}
        disabled={isDisabled}
        className={SET_INPUT}
      />
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        value={row.reps}
        onChange={(event) => onChange(row.id, "reps", event.target.value)}
        placeholder={targetReps.trim() || t("repsUnit")}
        aria-label={t("repsLabel", { set: setNumber })}
        disabled={isDisabled}
        className={SET_INPUT}
      />
      <button
        type="button"
        onClick={() => onRemove(row.id)}
        disabled={!canRemove || isDisabled}
        aria-label={t("deleteLabel", { set: setNumber })}
        className={ICON_BUTTON}
      >
        <Trash2 className="size-5" aria-hidden />
      </button>
      {hint && (
        <button
          type="button"
          onClick={() => onApplyHint(row.id, hint)}
          disabled={isDisabled}
          aria-label={t("hintLabel", { text: hintText, set: setNumber })}
          className="col-span-2 col-start-2 flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-surface px-3 text-sm text-muted transition active:scale-[0.98] disabled:opacity-50"
        >
          <CornerDownLeft className="size-4 shrink-0" aria-hidden />
          <span className="truncate">
            {t("hintPrefix")} {hintText}
          </span>
        </button>
      )}
    </li>
  );
};
