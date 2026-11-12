import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import { CONFIRM_MESSAGES, WORKOUT_MESSAGES } from "@pt/contracts";

// Every error carries a stable `code` and the message the web showed.

const failure = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ code, message }, status);

export class ExerciseNotFoundError extends NotFoundException {
  constructor() {
    super({
      code: "EXERCISE_NOT_FOUND",
      message: WORKOUT_MESSAGES.EXERCISE_NOT_FOUND,
    });
  }
}

// The trainee tried to log a day that has not come yet.
export const completionTooEarly = () =>
  failure(
    HttpStatus.CONFLICT,
    "COMPLETION_TOO_EARLY",
    WORKOUT_MESSAGES.COMPLETION_TOO_EARLY,
  );

// The first schema message, exactly as the web showed it for a bad set row.
export const invalidSets = (message: string) =>
  failure(HttpStatus.BAD_REQUEST, "INVALID_SETS", message);

// A new link would delete the trainee's logged sets: ask the PT first.
export const linkChangeNeedsConfirm = () =>
  failure(
    HttpStatus.CONFLICT,
    "LINK_CHANGE_NEEDS_CONFIRM",
    WORKOUT_MESSAGES.LINK_CHANGE_NEEDS_CONFIRM,
  );

// Deleting would delete the trainee's logged sets: ask the PT first.
export const deleteNeedsConfirm = () =>
  failure(
    HttpStatus.CONFLICT,
    "EXERCISE_HAS_SETS",
    CONFIRM_MESSAGES.DELETE_EXERCISE_WITH_SETS,
  );

export const copySameWeek = () =>
  failure(
    HttpStatus.BAD_REQUEST,
    "COPY_SAME_WEEK",
    WORKOUT_MESSAGES.COPY_SAME_WEEK,
  );

export const copyEmpty = () =>
  failure(HttpStatus.CONFLICT, "COPY_EMPTY", WORKOUT_MESSAGES.COPY_EMPTY);

export const copyTargetHasSets = () =>
  failure(
    HttpStatus.CONFLICT,
    "COPY_TARGET_HAS_SETS",
    WORKOUT_MESSAGES.COPY_TARGET_HAS_SETS,
  );

export const noTargetDays = () =>
  failure(
    HttpStatus.BAD_REQUEST,
    "NO_TARGET_DAYS",
    WORKOUT_MESSAGES.NO_TARGET_DAYS,
  );

export const pastTargetDays = () =>
  failure(
    HttpStatus.BAD_REQUEST,
    "PAST_TARGET_DAYS",
    WORKOUT_MESSAGES.PAST_TARGET_DAYS,
  );

export const copyDayEmpty = () =>
  failure(
    HttpStatus.CONFLICT,
    "COPY_DAY_EMPTY",
    WORKOUT_MESSAGES.COPY_DAY_EMPTY,
  );

export const copyDayTargetHasSets = () =>
  failure(
    HttpStatus.CONFLICT,
    "COPY_DAY_TARGET_HAS_SETS",
    WORKOUT_MESSAGES.COPY_DAY_TARGET_HAS_SETS,
  );
