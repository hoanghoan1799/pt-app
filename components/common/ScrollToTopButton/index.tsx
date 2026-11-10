"use client";

import { useTranslations } from "next-intl";

import { ScrollJumpButton } from "@/components/common/ScrollJumpButton";
import { useScrollAway } from "@/hooks/use-scroll-away";
import { cn } from "@/utils/cn";

interface ScrollToTopButtonProps {
  // Lift the button above the fixed user tab bar.
  aboveTabBar?: boolean;
}

// Back-to-top button for pages that scroll the window.
export const ScrollToTopButton = ({
  aboveTabBar = false,
}: ScrollToTopButtonProps) => {
  const t = useTranslations("common.scrollJump");
  const { isAway, scrollToEdge } = useScrollAway({ edge: "top" });

  return (
    <div
      className={cn(
        "fixed left-1/2 z-20 -translate-x-1/2",
        aboveTabBar
          ? "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]"
          : "bottom-[calc(env(safe-area-inset-bottom)+1rem)]",
      )}
    >
      <ScrollJumpButton
        direction="up"
        visible={isAway}
        label={t("toTop")}
        onClick={scrollToEdge}
      />
    </div>
  );
};
