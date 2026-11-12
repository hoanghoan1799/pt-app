import { HttpException, HttpStatus } from "@nestjs/common";
import {
  SOCIAL_ERROR_CODES as CODES,
  SOCIAL_FRIEND_MESSAGES as FRIEND,
  SOCIAL_MESSAGES as MESSAGES,
} from "@pt/contracts";

// Every error carries a stable `code` and the message the web showed.
const failure = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ code, message }, status);

export const termsRequired = () =>
  failure(HttpStatus.FORBIDDEN, CODES.TERMS_REQUIRED, MESSAGES.TERMS_REQUIRED);
export const emptyPost = () =>
  failure(HttpStatus.BAD_REQUEST, CODES.EMPTY_POST, MESSAGES.EMPTY_POST);
// Missing, deleted and invisible posts all look the same.
export const postNotFound = () =>
  failure(HttpStatus.NOT_FOUND, CODES.POST_NOT_FOUND, MESSAGES.NOT_FOUND);
export const commentNotFound = () =>
  failure(
    HttpStatus.NOT_FOUND,
    CODES.COMMENT_NOT_FOUND,
    MESSAGES.COMMENT_NOT_FOUND,
  );
export const notAllowed = () =>
  failure(HttpStatus.FORBIDDEN, CODES.NOT_ALLOWED, MESSAGES.NOT_ALLOWED);
export const photoNotFound = () =>
  failure(
    HttpStatus.NOT_FOUND,
    CODES.PHOTO_NOT_FOUND,
    MESSAGES.PHOTO_NOT_FOUND,
  );
export const photoTooLarge = () =>
  failure(
    HttpStatus.PAYLOAD_TOO_LARGE,
    CODES.PHOTO_TOO_LARGE,
    MESSAGES.PHOTO_TOO_LARGE,
  );
export const badImage = () =>
  failure(HttpStatus.BAD_REQUEST, CODES.BAD_IMAGE, MESSAGES.PHOTO_BAD_IMAGE);
export const profileNotFound = () =>
  failure(HttpStatus.NOT_FOUND, CODES.PROFILE_NOT_FOUND, FRIEND.NOT_FOUND);
export const userNotFound = () =>
  failure(HttpStatus.NOT_FOUND, CODES.USER_NOT_FOUND, FRIEND.NOT_FOUND);
export const emailInvalid = () =>
  failure(HttpStatus.BAD_REQUEST, CODES.EMAIL_INVALID, FRIEND.EMAIL_INVALID);
export const alreadyFriends = () =>
  failure(HttpStatus.CONFLICT, CODES.ALREADY_FRIENDS, FRIEND.ALREADY_FRIENDS);
export const alreadyRequested = () =>
  failure(
    HttpStatus.CONFLICT,
    CODES.ALREADY_REQUESTED,
    FRIEND.ALREADY_REQUESTED,
  );
export const friendRateLimited = () =>
  failure(
    HttpStatus.TOO_MANY_REQUESTS,
    CODES.RATE_LIMITED,
    FRIEND.RATE_LIMITED,
  );
export const reportNotFound = () =>
  failure(
    HttpStatus.NOT_FOUND,
    CODES.REPORT_NOT_FOUND,
    FRIEND.REPORT_NOT_FOUND,
  );
export const idempotencyKeyInvalid = () =>
  failure(
    HttpStatus.BAD_REQUEST,
    CODES.IDEMPOTENCY_KEY_INVALID,
    MESSAGES.IDEMPOTENCY_KEY_INVALID,
  );
