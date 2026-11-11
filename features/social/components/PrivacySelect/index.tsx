"use client";

import clsx from "clsx";
import {
  Check,
  ChevronDown,
  Globe,
  Lock,
  type LucideIcon,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import { POST_PRIVACIES } from "@/features/social/constants/social";
import type { PostPrivacy } from "@/features/social/types/social";

export const PRIVACY_ICONS: Record<PostPrivacy, LucideIcon> = {
  everyone: Globe,
  friends: Users,
  only_me: Lock,
};

interface PrivacySelectProps {
  id: string;
  value: PostPrivacy;
  onChange: (value: PostPrivacy) => void;
  disabled?: boolean;
}

// Privacy picker: a pill button that opens a small menu with the three
// options, each with its icon and a one-line hint.
export const PrivacySelect = ({
  id,
  value,
  onChange,
  disabled,
}: PrivacySelectProps) => {
  const t = useTranslations("social");
  const [isOpen, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const CurrentIcon = PRIVACY_ICONS[value];

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      buttonRef.current?.focus();
    }
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    itemRefs.current[POST_PRIVACIES.indexOf(value)]?.focus();

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
    // Focus only when the menu opens, not when the value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = itemRefs.current.filter(Boolean) as HTMLButtonElement[];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;

    items[(current + step + items.length) % items.length]?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        id={id}
        aria-label={t("privacy.label")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium text-fg transition active:bg-line/70 disabled:opacity-50"
      >
        <CurrentIcon className="size-4 text-muted" aria-hidden />
        {t(`privacy.${value}`)}
        <ChevronDown
          className={clsx(
            "size-4 text-muted transition",
            isOpen && "rotate-180",
          )}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div
          role="menu"
          aria-label={t("privacy.label")}
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1 shadow-lg"
        >
          {POST_PRIVACIES.map((privacy, index) => {
            const Icon = PRIVACY_ICONS[privacy];
            const isSelected = privacy === value;

            return (
              <button
                key={privacy}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                onClick={() => {
                  onChange(privacy);
                  close(true);
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2 text-left active:bg-line/70"
              >
                <Icon className="size-5 shrink-0 text-muted" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-fg">
                    {t(`privacy.${privacy}`)}
                  </span>
                  <span className="block text-xs text-muted">
                    {t(`privacy.hint.${privacy}`)}
                  </span>
                </span>
                {isSelected && (
                  <Check className="size-5 shrink-0 text-accent" aria-hidden />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
