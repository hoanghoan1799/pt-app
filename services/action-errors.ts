import { unstable_rethrow } from "next/navigation";

import {
  ERROR_REFERENCE_LENGTH,
  GENERIC_ERROR_MESSAGE,
} from "@/constants/errors";
import { logServerError } from "@/services/logger";
import type { ActionResult } from "@/types/error";
import type { FormState } from "@/types/form";
import { getErrorMessage } from "@/utils/errors";
import { createErrorState, getFormValues } from "@/utils/form";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// Never send a typed password back to the browser.
const SECRET_FIELD_PATTERN = /password/i;

const omitSecrets = (values: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(values).filter(([key]) => !SECRET_FIELD_PATTERN.test(key)),
  );

// Logs the real cause and returns what the user may see: in production only a
// generic message plus a reference id to find the log line; in development
// the readable cause and its code, to debug without opening the logs.
const toPublicError = (context: string, error: unknown) => {
  // redirect()/notFound() are thrown on purpose and must reach Next.js.
  unstable_rethrow(error);

  const referenceId = crypto.randomUUID().slice(0, ERROR_REFERENCE_LENGTH);
  const classified = logServerError(context, error, { referenceId });

  return IS_PRODUCTION
    ? { message: GENERIC_ERROR_MESSAGE, reference: referenceId }
    : {
        message: getErrorMessage(classified),
        reference: `${classified.code} · ${referenceId}`,
      };
};

// Wraps a form action so an unexpected failure (database down, missing env
// var…) comes back as an error message in the form instead of a 500 page.
export const withFormErrorHandling =
  <Args extends unknown[]>(
    context: string,
    action: (...args: Args) => Promise<FormState>,
  ) =>
  async (...args: Args): Promise<FormState> => {
    try {
      return await action(...args);
    } catch (error) {
      const { message, reference } = toPublicError(context, error);
      const formData = args.find(
        (arg): arg is FormData => arg instanceof FormData,
      );

      return createErrorState(message, {
        errorReference: reference,
        // Keep what was typed so the user can simply retry.
        values: formData ? omitSecrets(getFormValues(formData)) : undefined,
      });
    }
  };

// Same for actions called directly from event handlers.
export const withResultErrorHandling =
  <Args extends unknown[]>(
    context: string,
    action: (...args: Args) => Promise<ActionResult | void>,
  ) =>
  async (...args: Args): Promise<ActionResult> => {
    try {
      return (await action(...args)) ?? { status: "success" };
    } catch (error) {
      return { status: "error", ...toPublicError(context, error) };
    }
  };
