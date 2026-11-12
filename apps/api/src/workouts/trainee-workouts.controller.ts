import { Body, Controller, Get, Param, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  completionResponseSchema,
  type DateRangeQuery,
  dateRangeQuerySchema,
  exercisePathSchema,
  saveSetsRequestSchema,
  saveSetsResponseSchema,
  scheduleResponseSchema,
  type SetCompletionRequest,
  setCompletionRequestSchema,
} from "@pt/contracts";
import { exerciseSetsSchema } from "@pt/contracts";
import { z } from "zod";

import type { UserActor } from "../auth/actor.js";
import { Actor, User } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { toScheduleResponse } from "./mappers.js";
import { TraineeWorkoutsService } from "./trainee-workouts.service.js";
import { ApiPathParams, ApiQueries } from "./workouts.openapi.js";

const setsBody = z.object({ sets: exerciseSetsSchema });

// The signed-in trainee's own workouts. HTTP only; the rules live in
// TraineeWorkoutsService.
@ApiTags("workouts")
@Controller("me")
export class TraineeWorkoutsController {
  constructor(private readonly workouts: TraineeWorkoutsService) {}

  @Get("workout-days")
  @User()
  @ApiQueries(
    { name: "from", required: true, description: "YYYY-MM-DD" },
    { name: "to", required: true, description: "YYYY-MM-DD, at most 42 days" },
  )
  @ApiOkResponse({
    schema: toOpenApiSchema(scheduleResponseSchema),
    description:
      "One entry per date with exercises, completions, logged sets, last-session hints and the record flag",
  })
  @ApiErrors(400, 401, 403)
  async schedule(
    @Actor() actor: UserActor,
    @Query({ schema: dateRangeQuerySchema }) range: DateRangeQuery,
  ) {
    return toScheduleResponse(await this.workouts.getSchedule(actor.id, range));
  }

  @Put("exercises/:exerciseId/sets")
  @User()
  @ApiPathParams("exerciseId")
  @ApiBody({ schema: toOpenApiSchema(setsBody, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(saveSetsResponseSchema),
    description:
      "Replaces the exercise's logged sets; one or more marks it done",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  async saveSets(
    @Actor() actor: UserActor,
    @Param({ schema: exercisePathSchema }) params: { exerciseId: number },
    @Body({ schema: saveSetsRequestSchema }) body: { sets: unknown[] },
  ) {
    const result = await this.workouts.saveSets(
      actor.id,
      params.exerciseId,
      body.sets,
    );

    return {
      personalBest: result.personalBest,
      completedAt: result.completedAt ? result.completedAt.toISOString() : null,
    };
  }

  @Put("exercises/:exerciseId/completion")
  @User()
  @ApiPathParams("exerciseId")
  @ApiBody({ schema: toOpenApiSchema(setCompletionRequestSchema, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(completionResponseSchema),
    description: "Sets (not toggles) the state, so a double tap is harmless",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  async setCompletion(
    @Actor() actor: UserActor,
    @Param({ schema: exercisePathSchema }) params: { exerciseId: number },
    @Body({ schema: setCompletionRequestSchema }) body: SetCompletionRequest,
  ) {
    const completedAt = await this.workouts.setCompletion(
      actor.id,
      params.exerciseId,
      body.completed,
    );

    return { completedAt: completedAt ? completedAt.toISOString() : null };
  }
}
