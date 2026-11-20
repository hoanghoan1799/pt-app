import { ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import {
  describeSuspensionVi,
  RESTRICTION_ERROR_CODES,
  RESTRICTION_MESSAGES,
} from "@pt/contracts";

import { notFoundError } from "../common/errors.js";

// A restricted trainee tried a guarded write (spec "Guarded actions").
export class RestrictedError extends ForbiddenException {
  constructor() {
    super({
      code: RESTRICTION_ERROR_CODES.RESTRICTED,
      message: RESTRICTION_MESSAGES.RESTRICTED,
    });
  }
}

// D4: a suspended trainee gave the right password. The message is the
// Vietnamese text; `details` lets a client render its own locale.
export class AccountSuspendedError extends ForbiddenException {
  constructor(restriction: { until: Date | null; reason: string }) {
    super({
      code: RESTRICTION_ERROR_CODES.ACCOUNT_SUSPENDED,
      message: describeSuspensionVi(restriction),
      details: {
        reason: restriction.reason,
        permanent: restriction.until === null,
        ...(restriction.until
          ? { until: restriction.until.toISOString() }
          : {}),
      },
    });
  }
}

export const restrictionErrors = {
  userNotFound: () =>
    notFoundError("TRAINEE_NOT_FOUND", RESTRICTION_MESSAGES.USER_NOT_FOUND),
  notRestricted: () =>
    new HttpException(
      {
        code: RESTRICTION_ERROR_CODES.NOT_RESTRICTED,
        message: RESTRICTION_MESSAGES.NOT_RESTRICTED,
      },
      HttpStatus.CONFLICT,
    ),
};
