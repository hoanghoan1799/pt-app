import type { LucideIcon } from "lucide-react";

import { CARD } from "@/constants/styles";

interface RestDayStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export const RestDayState = ({
  icon: Icon,
  title,
  description,
}: RestDayStateProps) => (
  <div className={`${CARD} flex flex-col items-center px-6 py-12 text-center`}>
    <span className="flex size-14 items-center justify-center rounded-full bg-accent/12 text-accent">
      <Icon className="size-7" aria-hidden />
    </span>
    <p className="mt-4 text-lg font-semibold text-fg">{title}</p>
    <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>
  </div>
);
