import type { LucideIcon } from "lucide-react";

import { CARD } from "@/constants/styles";

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
}

export const StatTile = ({ icon: Icon, label, value, hint }: StatTileProps) => (
  <div className={`${CARD} p-4`}>
    <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
      <Icon className="size-4" aria-hidden />
      {label}
    </p>
    <p className="mt-2 text-2xl leading-none font-bold text-fg tabular-nums">
      {value}
    </p>
    <p className="mt-1.5 truncate text-xs text-muted">{hint}</p>
  </div>
);
