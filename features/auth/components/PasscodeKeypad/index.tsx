"use client";

import clsx from "clsx";
import { Delete } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { PASSCODE_LENGTH } from "@/features/auth/utils/passcode-rules";

interface PasscodeKeypadProps {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
  hasError?: boolean;
  // Also accept digits and Backspace from a hardware keyboard.
  isKeyboardEnabled?: boolean;
}

const DIGIT_ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
] as const;

const KEY =
  "flex size-16 items-center justify-center justify-self-center rounded-full border border-line bg-surface text-2xl font-semibold text-fg transition select-none active:bg-line disabled:opacity-40";

// Four dots plus a 0-9 keypad. The parent owns the value and reacts when it
// reaches PASSCODE_LENGTH digits.
export const PasscodeKeypad = ({
  value,
  onChange,
  isDisabled = false,
  hasError = false,
  isKeyboardEnabled = false,
}: PasscodeKeypadProps) => {
  const t = useTranslations("auth.passcodeKeypad");
  const addDigit = (digit: string) => {
    if (!isDisabled && value.length < PASSCODE_LENGTH) {
      onChange(value + digit);
    }
  };
  const removeDigit = () => {
    if (!isDisabled) {
      onChange(value.slice(0, -1));
    }
  };

  useEffect(() => {
    if (!isKeyboardEnabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.closest("input, textarea")) {
        return;
      }
      if (/^\d$/.test(event.key)) {
        addDigit(event.key);
      } else if (event.key === "Backspace") {
        removeDigit();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="flex flex-col items-center gap-8">
      <div
        role="img"
        aria-label={t("progress", {
          count: value.length,
          total: PASSCODE_LENGTH,
        })}
        className="flex gap-4"
      >
        {Array.from({ length: PASSCODE_LENGTH }, (_, index) => (
          <span
            key={index}
            className={clsx(
              "size-4 rounded-full border-2 transition",
              hasError
                ? "border-danger"
                : index < value.length
                  ? "border-accent"
                  : "border-line",
              index < value.length && (hasError ? "bg-danger" : "bg-accent"),
            )}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-4">
        {DIGIT_ROWS.flat().map((digit) => (
          <button
            key={digit}
            type="button"
            className={KEY}
            disabled={isDisabled}
            onClick={() => addDigit(digit)}
          >
            {digit}
          </button>
        ))}
        <span aria-hidden />
        <button
          type="button"
          className={KEY}
          disabled={isDisabled}
          onClick={() => addDigit("0")}
        >
          0
        </button>
        <button
          type="button"
          className={clsx(KEY, "border-transparent bg-transparent")}
          disabled={isDisabled || value.length === 0}
          onClick={removeDigit}
          aria-label={t("delete")}
        >
          <Delete className="size-6" aria-hidden />
        </button>
      </div>
    </div>
  );
};
