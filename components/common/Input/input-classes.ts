export type InputSize = "sm" | "md" | "lg";
export type ClearPosition = "start" | "end";

// Full class names are spelled out so Tailwind can see them.
const SIZE_CLASSES: Record<InputSize, string> = {
  sm: "min-h-10 text-sm",
  md: "min-h-12",
  lg: "min-h-14",
};

// Classes for 0, 1 or 2 slots on a side; a slot is one 44px+ icon cell.
const PADDING_LEFT: Record<InputSize, [string, string, string]> = {
  sm: ["pl-4", "pl-11", "pl-22"],
  md: ["pl-4", "pl-11", "pl-22"],
  lg: ["pl-4", "pl-12", "pl-24"],
};
const PADDING_RIGHT: Record<InputSize, [string, string, string]> = {
  sm: ["pr-4", "pr-11", "pr-22"],
  md: ["pr-4", "pr-11", "pr-22"],
  lg: ["pr-4", "pr-12", "pr-24"],
};

export const getSizeClasses = (size: InputSize) => SIZE_CLASSES[size];

interface SlotInput {
  size: InputSize;
  hasLeading: boolean;
  hasTrailing: boolean;
  // True when the clear slot is reserved (even while the button is hidden), so
  // the text does not jump when it appears.
  showClear: boolean;
  clearPosition: ClearPosition;
}

export const getSlotClasses = ({
  size,
  hasLeading,
  hasTrailing,
  showClear,
  clearPosition,
}: SlotInput) => {
  const start =
    Number(hasLeading) + Number(showClear && clearPosition === "start");
  const end =
    Number(hasTrailing) + Number(showClear && clearPosition === "end");

  return `${PADDING_LEFT[size][start]} ${PADDING_RIGHT[size][end]}`;
};

export const shouldShowClear = ({
  clearable,
  hasValue,
  disabled,
  readOnly,
}: {
  clearable: boolean;
  hasValue: boolean;
  disabled?: boolean;
  readOnly?: boolean;
}) => clearable && hasValue && !disabled && !readOnly;
