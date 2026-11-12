import type { Instrumentation } from "next";

// Logs every uncaught server error (pages, route handlers, proxy) with its
// digest, the same id the error page shows to the user.
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const { logServerError } = await import("@/services/logger");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;

  logServerError(`${request.method} ${request.path}`, error, {
    digest,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
