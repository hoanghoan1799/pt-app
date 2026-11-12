import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  deleteExerciseQuerySchema,
  type ExerciseRequest,
  exerciseRequestSchema,
  exerciseResponseSchema,
  type MoveExerciseRequest,
  moveExerciseRequestSchema,
  traineeDayPathSchema,
  traineeExercisePathSchema,
} from "@pt/contracts";

import { Admin, ScopedToTrainee } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { ExercisesService } from "./exercises.service.js";
import { toExerciseResponse } from "./mappers.js";
import { ApiPathParams, ApiQueries } from "./workouts.openapi.js";

// A PT's exercises on a trainee's days. Paths go through the trainee so the
// PtScopeGuard checks scope; the service also requires the exercise to belong
// to that trainee.
@ApiTags("workouts")
@Controller("trainees/:userId")
@Admin()
@ScopedToTrainee()
export class ExercisesController {
  constructor(private readonly exercises: ExercisesService) {}

  @Post("workout-days/:date/exercises")
  @ApiPathParams("userId", "date")
  @ApiBody({ schema: toOpenApiSchema(exerciseRequestSchema, "input") })
  @ApiCreatedResponse({
    schema: toOpenApiSchema(exerciseResponseSchema),
    description: "Added at the end of the day; the day is created if needed",
  })
  @ApiErrors(400, 401, 403, 404)
  async create(
    @Param({ schema: traineeDayPathSchema })
    params: { userId: number; date: string },
    @Body({ schema: exerciseRequestSchema }) body: ExerciseRequest,
  ) {
    return toExerciseResponse(
      await this.exercises.create(params.userId, params.date, body),
    );
  }

  @Put("exercises/:exerciseId")
  @ApiPathParams("userId", "exerciseId")
  @ApiBody({ schema: toOpenApiSchema(exerciseRequestSchema, "input") })
  @ApiOkResponse({
    schema: toOpenApiSchema(exerciseResponseSchema),
    description:
      "A new video link deletes the trainee's logged sets, only with confirmResetSets",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  async update(
    @Param({ schema: traineeExercisePathSchema })
    params: { userId: number; exerciseId: number },
    @Body({ schema: exerciseRequestSchema }) body: ExerciseRequest,
  ) {
    return toExerciseResponse(
      await this.exercises.update(params.userId, params.exerciseId, body),
    );
  }

  @Delete("exercises/:exerciseId")
  @HttpCode(204)
  @ApiPathParams("userId", "exerciseId")
  @ApiQueries({
    name: "confirmDeleteSets",
    description: "true after the PT confirmed that logged sets are deleted too",
  })
  @ApiNoContentResponse({
    description: "Deleted, or already gone",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  async remove(
    @Param({ schema: traineeExercisePathSchema })
    params: { userId: number; exerciseId: number },
    @Query({ schema: deleteExerciseQuerySchema })
    query: { confirmDeleteSets: boolean },
  ) {
    await this.exercises.remove(
      params.userId,
      params.exerciseId,
      query.confirmDeleteSets,
    );
  }

  @Post("exercises/:exerciseId/move")
  @HttpCode(204)
  @ApiPathParams("userId", "exerciseId")
  @ApiBody({ schema: toOpenApiSchema(moveExerciseRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Moved; an edge is a no-op" })
  @ApiErrors(400, 401, 403, 404)
  async move(
    @Param({ schema: traineeExercisePathSchema })
    params: { userId: number; exerciseId: number },
    @Body({ schema: moveExerciseRequestSchema }) body: MoveExerciseRequest,
  ) {
    await this.exercises.move(params.userId, params.exerciseId, body.direction);
  }
}
