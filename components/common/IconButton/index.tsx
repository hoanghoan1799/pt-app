import type { ComponentProps } from "react";

import { ICON_BUTTON_BASE } from "@/constants/styles";
import { cn } from "@/utils/cn";

const SIZES = { sm: "size-9", md: "size-11", lg: "size-12" } as const;

interface IconButtonProps extends Omit<ComponentProps<"button">, "aria-label"> {
  // Required: an icon-only button has no other accessible name.
  label: string;
  size?: keyof typeof SIZES;
}

export const IconButton = ({
  label,
  size = "md",
  type = "button",
  className,
  children,
  ...rest
}: IconButtonProps) => (
  <button
    {...rest}
    type={type}
    aria-label={label}
    className={cn(ICON_BUTTON_BASE, SIZES[size], className)}
  >
    {children}
  </button>
);
