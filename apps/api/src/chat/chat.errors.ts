import { HttpException, HttpStatus } from "@nestjs/common";
import { CHAT_MESSAGES, CHAT_PHOTO_ERRORS } from "@pt/contracts";

import { notFoundError, payloadTooLargeError } from "../common/errors.js";

// Domain errors of the chat. Each has a stable `code`; the message is the same
// Vietnamese text the web shows today.

const rule = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ code, message }, status);

export const chatErrors = {
  conversationNotFound: () =>
    notFoundError(
      "CONVERSATION_NOT_FOUND",
      CHAT_MESSAGES.CONVERSATION_NOT_FOUND,
    ),
  messageNotFound: () =>
    notFoundError("MESSAGE_NOT_FOUND", CHAT_MESSAGES.MESSAGE_NOT_FOUND),
  userNotFound: () =>
    notFoundError("USER_NOT_FOUND", CHAT_MESSAGES.USER_NOT_FOUND),
  postNotFound: () =>
    notFoundError("POST_NOT_FOUND", CHAT_MESSAGES.POST_NOT_FOUND),
  photoNotFound: () =>
    notFoundError("PHOTO_NOT_FOUND", CHAT_PHOTO_ERRORS.NOT_FOUND),
  invalidInput: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "CHAT_INVALID_INPUT",
      CHAT_MESSAGES.INVALID_INPUT,
    ),
  postNeedsText: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "POST_NEEDS_TEXT",
      CHAT_MESSAGES.POST_NEEDS_TEXT,
    ),
  chatLocked: () =>
    rule(HttpStatus.FORBIDDEN, "CHAT_LOCKED", CHAT_MESSAGES.CHAT_LOCKED),
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
  keyReused: () =>
    rule(
      HttpStatus.CONFLICT,
      "IDEMPOTENCY_KEY_REUSED",
      CHAT_MESSAGES.KEY_REUSED,
    ),
  photoTooLarge: () =>
    payloadTooLargeError("PHOTO_TOO_LARGE", CHAT_PHOTO_ERRORS.TOO_LARGE),
  badImage: () =>
    rule(HttpStatus.BAD_REQUEST, "BAD_IMAGE", CHAT_PHOTO_ERRORS.BAD_IMAGE),
  invalidKey: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "IDEMPOTENCY_KEY_INVALID",
      "Idempotency-Key không hợp lệ",
    ),
};
