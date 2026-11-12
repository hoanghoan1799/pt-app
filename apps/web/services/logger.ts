import type { ClassifiedError } from "@/types/error";
import { classifyError } from "@/utils/errors";

// One searchable line per failure in Vercel → Logs, e.g.
// "[pt-app] loginAdmin failed · DB_NOT_MIGRATED {...}".
export const logServerError = (
  context: string,
  error: unknown,
  extra: Record<string, unknown> = {},
): ClassifiedError => {
  const classified = classifyError(error);

  console.error(
    `[pt-app] ${context} failed · ${classified.code}`,
    JSON.stringify({
      context,
      ...classified,
      ...extra,
      stack: error instanceof Error ? error.stack : undefined,
    }),
  );
  return classified;
};
