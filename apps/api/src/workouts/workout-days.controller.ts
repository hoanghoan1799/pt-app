import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  type CopyDayRequest,
  copyDayRequestSchema,
  copyDayResponseSchema,
  copyInfoResponseSchema,
  type CopyWeekRequest,
  copyWeekRequestSchema,
  copyWeekResponseSchema,
  type DateRangeQuery,
  dateRangeQuerySchema,
  type SaveWorkoutDayRequest,
  saveWorkoutDayRequestSchema,
  scheduleResponseSchema,
  traineeDayPathSchema,
  traineePathSchema,
  workoutDayResponseSchema,
} from "@pt/contracts";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin, ScopedToTrainee } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { toScheduleResponse } from "./mappers.js";
import { WorkoutDaysService } from "./workout-days.service.js";
import { ApiPathParams, ApiQueries } from "./workouts.openapi.js";

const rangeQueries = [
  { name: "from", required: true, description: "YYYY-MM-DD" },
  { name: "to", required: true, description: "YYYY-MM-DD, at most 42 days" },
];

// A PT plans a trainee's days. Every route is about the trainee in `:userId`,
// so the PtScopeGuard has already checked workspace and hidden state.
@ApiTags("workouts")
@Controller("trainees/:userId/workout-days")
@Admin()
@ScopedToTrainee()
export class WorkoutDaysController {
  constructor(private readonly days: WorkoutDaysService) {}

  @Get()
  @ApiPathParams("userId")
  @ApiQueries(...rangeQueries)
  @ApiOkResponse({
    schema: toOpenApiSchema(scheduleResponseSchema),
    description: "One entry per date, with sets, hints and the record flag",
  })
  @ApiErrors(400, 401, 403, 404)
  async schedule(
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Query({ schema: dateRangeQuerySchema }) range: DateRangeQuery,
  ) {
    return toScheduleResponse(await this.days.getSchedule(params.userId, range));
  }

  // The copy sheet's month picker: days that have a workout and days that are
  // locked by logged sets.
  @Get("copy-info")
  @ApiPathParams("userId")
  @ApiQueries(...rangeQueries)
  @ApiOkResponse({ schema: toOpenApiSchema(copyInfoResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  copyInfo(
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Query({ schema: dateRangeQuerySchema }) range: DateRangeQuery,
  ) {
    return this.days.copyInfo(params.userId, range);
  }

  @Put(":date")
  @ApiPathParams("userId", "date")
  @ApiBody({ schema: toOpenApiSchema(saveWorkoutDayRequestSchema, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(workoutDayResponseSchema),
    description: "Creates the day or updates its title and note",
  })
  @ApiErrors(400, 401, 403, 404)
  saveDay(
    @Param({ schema: traineeDayPathSchema })
    params: { userId: number; date: string },
    @Body({ schema: saveWorkoutDayRequestSchema }) body: SaveWorkoutDayRequest,
  ) {
    return this.days.saveDay(params.userId, params.date, body);
  }

  @Post("copy-week")
  @HttpCode(200)
  @ApiPathParams("userId")
  @ApiBody({ schema: toOpenApiSchema(copyWeekRequestSchema, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(copyWeekResponseSchema),
    description: "The target week now matches the source week",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  copyWeek(
    @Actor() actor: AdminActor,
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Body({ schema: copyWeekRequestSchema }) body: CopyWeekRequest,
  ) {
    return this.days.copyWeek(actor, params.userId, body);
  }

  @Post("copy-day")
  @HttpCode(200)
  @ApiPathParams("userId")
  @ApiBody({ schema: toOpenApiSchema(copyDayRequestSchema, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(copyDayResponseSchema),
    description: "The day was copied to each target date",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  copyDay(
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Body({ schema: copyDayRequestSchema }) body: CopyDayRequest,
  ) {
    return this.days.copyDay(params.userId, body);
  }
}
