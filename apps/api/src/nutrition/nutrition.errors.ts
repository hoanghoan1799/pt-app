import { HttpException, HttpStatus, NotFoundException } from "@nestjs/common";
import {
  MEAL_LOG_MESSAGES,
  MEAL_PLAN_MESSAGES,
  NUTRITION_MESSAGES,
} from "@pt/contracts";
import { QueryFailedError } from "typeorm";

// Domain errors of nutrition and meal plans. Each has a stable `code`; the
// message is the same Vietnamese text the web shows today.

const notFound = (code: string, message: string) =>
  new NotFoundException({ code, message });

const rule = (status: HttpStatus, code: string, message: string) =>
  new HttpException({ code, message }, status);

export const planErrors = {
  dayNotFound: () =>
    notFound("DAY_NOT_FOUND", MEAL_PLAN_MESSAGES.DAY_NOT_FOUND),
  mealNotFound: () =>
    notFound("MEAL_NOT_FOUND", MEAL_PLAN_MESSAGES.MEAL_NOT_FOUND),
  itemNotFound: () =>
    notFound("ITEM_NOT_FOUND", MEAL_PLAN_MESSAGES.ITEM_NOT_FOUND),
  foodNotFound: () =>
    notFound("FOOD_NOT_FOUND", MEAL_PLAN_MESSAGES.FOOD_NOT_FOUND),
  memberNotFound: () =>
    notFound("MEMBER_NOT_FOUND", MEAL_PLAN_MESSAGES.MEMBER_NOT_FOUND),
  noLastWeek: () => notFound("NO_LAST_WEEK", MEAL_PLAN_MESSAGES.NO_LAST_WEEK),
  planExists: () =>
    rule(HttpStatus.CONFLICT, "PLAN_EXISTS", MEAL_PLAN_MESSAGES.PLAN_EXISTS),
  foodAlreadyInMeal: () =>
    rule(
      HttpStatus.CONFLICT,
      "FOOD_ALREADY_IN_MEAL",
      MEAL_PLAN_MESSAGES.FOOD_ALREADY_IN_MEAL,
    ),
  tooManyMeals: () =>
    rule(
      HttpStatus.CONFLICT,
      "TOO_MANY_MEALS",
      MEAL_PLAN_MESSAGES.TOO_MANY_MEALS,
    ),
  tooManyItems: () =>
    rule(
      HttpStatus.CONFLICT,
      "TOO_MANY_ITEMS",
      MEAL_PLAN_MESSAGES.TOO_MANY_ITEMS,
    ),
  lastMeal: () =>
    rule(HttpStatus.CONFLICT, "LAST_MEAL", MEAL_PLAN_MESSAGES.LAST_MEAL),
  noTarget: () =>
    rule(HttpStatus.CONFLICT, "NO_TARGET", MEAL_PLAN_MESSAGES.NO_TARGET),
  reorderMismatch: () =>
    rule(
      HttpStatus.CONFLICT,
      "REORDER_MISMATCH",
      MEAL_PLAN_MESSAGES.REORDER_MISMATCH,
    ),
  nothingToSolve: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "NOTHING_TO_SOLVE",
      MEAL_PLAN_MESSAGES.NOTHING_TO_SOLVE,
    ),
  sharesTotal: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "SHARES_TOTAL",
      MEAL_PLAN_MESSAGES.SHARES_TOTAL,
    ),
  noTargetDays: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "NO_TARGET_DAYS",
      MEAL_PLAN_MESSAGES.NO_TARGET_DAYS,
    ),
  pastTargetDays: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "PAST_TARGET_DAYS",
      MEAL_PLAN_MESSAGES.PAST_TARGET_DAYS,
    ),
  invalidInput: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "INVALID_INPUT",
      MEAL_PLAN_MESSAGES.INVALID_INPUT,
    ),
};

export const logErrors = {
  mealNotFound: () =>
    notFound("MEAL_NOT_FOUND", MEAL_LOG_MESSAGES.MEAL_NOT_FOUND),
  logNotFound: () => notFound("LOG_NOT_FOUND", MEAL_LOG_MESSAGES.LOG_NOT_FOUND),
  foodNotFound: () =>
    notFound("FOOD_NOT_FOUND", MEAL_LOG_MESSAGES.FOOD_NOT_FOUND),
  foodMissing: () =>
    rule(HttpStatus.CONFLICT, "FOOD_MISSING", MEAL_LOG_MESSAGES.FOOD_MISSING),
  tooManyLogs: () =>
    rule(HttpStatus.CONFLICT, "TOO_MANY_LOGS", MEAL_LOG_MESSAGES.TOO_MANY_LOGS),
  futureDay: () =>
    rule(HttpStatus.BAD_REQUEST, "FUTURE_DAY", MEAL_LOG_MESSAGES.FUTURE_DAY),
  nameRequired: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "NAME_REQUIRED",
      MEAL_LOG_MESSAGES.NAME_REQUIRED,
    ),
  gramsRequired: () =>
    rule(
      HttpStatus.BAD_REQUEST,
      "GRAMS_REQUIRED",
      MEAL_LOG_MESSAGES.GRAMS_REQUIRED,
    ),
};

export const nutritionErrors = {
  entryEmpty: () =>
    rule(HttpStatus.BAD_REQUEST, "ENTRY_EMPTY", NUTRITION_MESSAGES.ENTRY_EMPTY),
  futureDate: () =>
    rule(HttpStatus.BAD_REQUEST, "FUTURE_DATE", NUTRITION_MESSAGES.FUTURE_DATE),
  entryNotFound: () =>
    notFound("ENTRY_NOT_FOUND", NUTRITION_MESSAGES.ENTRY_NOT_FOUND),
};

// PostgreSQL unique_violation, as thrown through the TypeORM driver.
export const isUniqueViolation = (error: unknown) =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string } | undefined)?.code === "23505";
