"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ChangeEvent,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";

import { IconButton } from "@/components/common/IconButton";
import {
  type ClearPosition,
  getSizeClasses,
  getSlotClasses,
  type InputSize,
  shouldShowClear,
} from "@/components/common/Input/input-classes";
import { INPUT_BASE } from "@/constants/styles";
import { cn } from "@/utils/cn";
import { mergeRefs } from "@/utils/merge-refs";

const VARIANTS = {
  default: "",
  filled: "bg-line/40 border-transparent",
} as const;

const SLOT_SIZES: Record<InputSize, string> = {
  sm: "size-11",
  md: "size-11",
  lg: "size-12",
};

export interface InputProps extends Omit<ComponentProps<"input">, "size"> {
  size?: InputSize;
  variant?: keyof typeof VARIANTS;
  clearable?: boolean;
  onClear?: () => void;
  clearIcon?: ReactNode;
  clearLabel?: string;
  clearPosition?: ClearPosition;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  invalid?: boolean;
  // `className` styles the <input>; this one styles the relative wrapper.
  wrapperClassName?: string;
}

const toHasValue = (value: unknown) =>
  Array.isArray(value) ? value.length > 0 : String(value ?? "").length > 0;

export const Input = ({
  size = "md",
  variant = "default",
  clearable = false,
  onClear,
  clearIcon,
  clearLabel,
  clearPosition = "end",
  leadingIcon,
  trailingIcon,
  invalid,
  className,
  wrapperClassName,
  ref,
  value,
  defaultValue,
  disabled,
  readOnly,
  onChange,
  onKeyDown,
  "aria-invalid": ariaInvalid,
  ...rest
}: InputProps) => {
  const t = useTranslations("common");
  const innerRef = useRef<HTMLInputElement>(null);
  const mergedRef = useMemo(() => mergeRefs(ref, innerRef), [ref]);
  const [uncontrolledHasValue, setUncontrolledHasValue] = useState(() =>
    toHasValue(defaultValue),
  );
  const isInvalid = invalid ?? (ariaInvalid === true || ariaInvalid === "true");
  const hasValue =
    value === undefined ? uncontrolledHasValue : toHasValue(value);

  const canClear = clearable && !disabled && !readOnly;
  const showClear = shouldShowClear({
    clearable,
    hasValue,
    disabled,
    readOnly,
  });

  const clear = () => {
    const input = innerRef.current;

    if (!input) {
      return;
    }
    // The native setter bypasses React's value tracking, so the dispatched
    // event reaches onChange for controlled and uncontrolled parents alike.
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;

    setValue?.call(input, "");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    onClear?.();
    input.focus();
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUncontrolledHasValue(event.target.value.length > 0);
    onChange?.(event);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.key === "Escape" && showClear && !event.defaultPrevented) {
      // Only swallow Escape when it cleared something, so sheets still close.
      event.preventDefault();
      event.stopPropagation();
      clear();
    }
  };

  const slot = cn(
    "pointer-events-none flex items-center justify-center text-muted",
    SLOT_SIZES[size],
  );
  const clearButton = showClear && (
    <IconButton
      label={clearLabel ?? t("clear")}
      size={size === "lg" ? "lg" : "md"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={clear}
    >
      {clearIcon ?? <X className="size-4" aria-hidden />}
    </IconButton>
  );

  return (
    <div className={cn("relative", wrapperClassName)}>
      {leadingIcon && (
        <span aria-hidden className={cn(slot, "absolute inset-y-0 left-0")}>
          {leadingIcon}
        </span>
      )}
      <input
        {...rest}
        ref={mergedRef}
        value={value}
        defaultValue={defaultValue}
        disabled={disabled}
        readOnly={readOnly}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-invalid={isInvalid || undefined}
        className={cn(
          INPUT_BASE,
          getSizeClasses(size),
          getSlotClasses({
            size,
            hasLeading: Boolean(leadingIcon),
            hasTrailing: Boolean(trailingIcon),
            showClear: canClear,
            clearPosition,
          }),
          VARIANTS[variant],
          isInvalid && "border-danger focus:border-danger focus:ring-danger/30",
          clearable && "[&::-webkit-search-cancel-button]:appearance-none",
          className,
        )}
      />
      {clearButton && clearPosition === "start" && (
        <span
          className={cn(
            "absolute inset-y-0 flex items-center",
            leadingIcon ? "left-11" : "left-0",
          )}
        >
          {clearButton}
        </span>
      )}
      <span className="absolute inset-y-0 right-0 flex items-center">
        {clearButton && clearPosition === "end" && clearButton}
        {trailingIcon && (
          <span aria-hidden className={slot}>
            {trailingIcon}
          </span>
        )}
      </span>
    </div>
  );
};
