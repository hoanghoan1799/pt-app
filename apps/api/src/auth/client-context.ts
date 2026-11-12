import type { Request } from "express";

import type { ClientContext } from "./sessions.service.js";

// Who is logging in from where, for the signed-in devices list.
export const clientContextOf = (
  request: Request,
  body: { clientKind: ClientContext["clientKind"]; clientName?: string },
): ClientContext => ({
  clientKind: body.clientKind,
  clientName: body.clientName ?? null,
  userAgent: request.headers["user-agent"] ?? null,
  ip: request.ip ?? null,
});
