import { HttpException, HttpStatus } from "@nestjs/common";
import {
  CHAT_MESSAGES,
  CHAT_PHOTO_ERRORS,
  GROUP_ERROR_CODES,
  GROUP_MESSAGES,
  type GroupSendBlockReason,
} from "@pt/contracts";

import { notFoundError, payloadTooLargeError } from "../common/errors.js";
import { RestrictedError } from "../restrictions/restrictions.errors.js";

// Domain errors of group chat. Each has a stable `code`; the message is the
// Vietnamese text company shows.

const rule = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Record<string, string>,
) =>
  new HttpException(
    details ? { code, message, details } : { code, message },
    status,
  );

export const groupErrors = {
  // Missing, dissolved (for a non super admin), not a member and left all
  // answer this, so group ids cannot be probed.
  groupNotFound: () =>
    notFoundError(
      GROUP_ERROR_CODES.GROUP_NOT_FOUND,
      GROUP_MESSAGES.GROUP_NOT_FOUND,
    ),
  messageNotFound: () =>
    notFoundError("MESSAGE_NOT_FOUND", CHAT_MESSAGES.MESSAGE_NOT_FOUND),
  photoNotFound: () =>
    notFoundError("PHOTO_NOT_FOUND", CHAT_PHOTO_ERRORS.NOT_FOUND),
  avatarNotFound: () => notFoundError("AVATAR_NOT_FOUND", "not_found"),
  memberNotFound: () =>
    notFoundError(
      GROUP_ERROR_CODES.MEMBER_NOT_FOUND,
      GROUP_MESSAGES.MEMBER_NOT_FOUND,
    ),
  alertNotFound: () =>
    notFoundError(
      GROUP_ERROR_CODES.ALERT_NOT_FOUND,
      GROUP_MESSAGES.ALERT_NOT_FOUND,
    ),
  alertHandled: (handledBy: string | null) =>
    rule(
      HttpStatus.CONFLICT,
      GROUP_ERROR_CODES.ALERT_HANDLED,
      GROUP_MESSAGES.ALERT_HANDLED,
      handledBy ? { handledBy } : undefined,
    ),
  invalidInput: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "CHAT_INVALID_INPUT",
      CHAT_MESSAGES.INVALID_INPUT,
    ),
  notManager: () =>
    rule(
      HttpStatus.FORBIDDEN,
      GROUP_ERROR_CODES.NOT_MANAGER,
      GROUP_MESSAGES.NOT_MANAGER,
    ),
  groupFull: () =>
    rule(
      HttpStatus.CONFLICT,
      GROUP_ERROR_CODES.GROUP_FULL,
      GROUP_MESSAGES.GROUP_FULL,
    ),
  managerCannotLeave: () =>
    rule(
      HttpStatus.FORBIDDEN,
      GROUP_ERROR_CODES.MANAGER_CANNOT_LEAVE,
      GROUP_MESSAGES.MANAGER_CANNOT_LEAVE,
    ),
  cannotRemoveManager: () =>
    rule(
      HttpStatus.FORBIDDEN,
      GROUP_ERROR_CODES.CANNOT_REMOVE_MANAGER,
      GROUP_MESSAGES.CANNOT_REMOVE_MANAGER,
    ),
  notYourMessage: () =>
    rule(
      HttpStatus.FORBIDDEN,
      "NOT_YOUR_MESSAGE",
      CHAT_MESSAGES.NOT_YOUR_MESSAGE,
    ),
  messageUnsent: () =>
    rule(HttpStatus.CONFLICT, "MESSAGE_UNSENT", CHAT_MESSAGES.MESSAGE_UNSENT),
  stickerNotEditable: () =>
    rule(
      HttpStatus.CONFLICT,
      "STICKER_NOT_EDITABLE",
      CHAT_MESSAGES.STICKER_NOT_EDITABLE,
    ),
  photoTooLarge: () =>
    payloadTooLargeError("PHOTO_TOO_LARGE", CHAT_PHOTO_ERRORS.TOO_LARGE),
  badImage: () =>
    rule(HttpStatus.BAD_REQUEST, "BAD_IMAGE", CHAT_PHOTO_ERRORS.BAD_IMAGE),
};

// The answer to a write the send-block rule refused (company
// group-access.ts messageFor): dissolved and left read as "not found".
export const sendBlockError = (reason: GroupSendBlockReason) => {
  switch (reason) {
    case "managers_only":
      return rule(
        HttpStatus.FORBIDDEN,
        GROUP_ERROR_CODES.MANAGERS_ONLY,
        GROUP_MESSAGES.MANAGERS_ONLY,
      );
    case "chat_off":
      return rule(
        HttpStatus.FORBIDDEN,
        "CHAT_LOCKED",
        CHAT_MESSAGES.CHAT_LOCKED,
      );
    case "restricted":
      return new RestrictedError();
    case "dissolved":
    case "left":
      return groupErrors.groupNotFound();
  }
};
