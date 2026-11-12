import type { TargetStatus } from "@/features/nutrition/types/nutrition";

export const STATUS_TEXT_CLASSES: Record<TargetStatus, string> = {
  none: "text-muted",
  under: "text-muted",
  on: "text-success",
  over: "text-danger",
};
