import "server-only";

import { TIME_ZONE } from "@/constants/time";
import {
  getActiveLocale,
  getErrorsTranslator,
} from "@/services/localize-message";
import { formatShortDateTime } from "@/utils/time";

// The login refusal of a suspended trainee: the end time (or "permanent") and
// the reason the super admin wrote, in the language of the request. Built from
// the API's ACCOUNT_SUSPENDED details (the API's own message is Vietnamese).
export const describeSuspension = async (suspension: {
  until: number | null;
  reason: string;
}) => {
  const [t, locale] = await Promise.all([
    getErrorsTranslator(),
    getActiveLocale(),
  ]);

  return suspension.until === null
    ? t("toasts.suspendedForever", { reason: suspension.reason })
    : t("toasts.suspendedUntil", {
        until: formatShortDateTime(suspension.until, TIME_ZONE, locale),
        reason: suspension.reason,
      });
};
