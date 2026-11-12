import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
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
  type AssignTraineePtRequest,
  assignTraineePtRequestSchema,
  type ChangeTraineeEmailRequest,
  changeTraineeEmailRequestSchema,
  type CreateTraineeRequest,
  createTraineeRequestSchema,
  type ListTraineesQuery,
  listTraineesQuerySchema,
  MEMBER_MESSAGES,
  passwordResetResponseSchema,
  traineeCredentialsResponseSchema,
  traineeDetailSchema,
  traineeListResponseSchema,
} from "@pt/contracts";
import { z } from "zod";

import type { AdminActor } from "../auth/actor.js";
import {
  Actor,
  Admin,
  Roles,
  ScopedToTrainee,
} from "../auth/decorators/index.js";
import { notFoundError } from "../common/errors.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { TraineesQueries } from "./trainees.queries.js";
import { TraineesService } from "./trainees.service.js";

const idParam = { schema: z.coerce.number().int().positive() };

// Trainees from the admin side. The PtScopeGuard (ScopedToTrainee) answers 404
// for a trainee outside the PT's workspace, hidden without a reveal, or missing.
@ApiTags("trainees")
@Controller("trainees")
export class TraineesController {
  constructor(
    private readonly trainees: TraineesService,
    private readonly queries: TraineesQueries,
  ) {}

  @Get()
  @Admin()
  @ApiOkResponse({ schema: toOpenApiSchema(traineeListResponseSchema) })
  @ApiErrors(400, 401, 403)
  async list(
    @Actor() actor: AdminActor,
    @Query({ schema: listTraineesQuerySchema }) query: ListTraineesQuery,
  ) {
    return { trainees: await this.queries.list(actor, query) };
  }

  @Post()
  @Admin()
  @ApiBody({ schema: toOpenApiSchema(createTraineeRequestSchema, "input") })
  @ApiCreatedResponse({
    schema: toOpenApiSchema(traineeCredentialsResponseSchema),
    description: "The generated password is shown this once",
  })
  @ApiErrors(400, 401, 403, 404, 409)
  create(
    @Actor() actor: AdminActor,
    @Body({ schema: createTraineeRequestSchema }) body: CreateTraineeRequest,
  ) {
    return this.trainees.create(actor, body);
  }

  @Get(":userId")
  @Admin()
  @ScopedToTrainee()
  @ApiOkResponse({ schema: toOpenApiSchema(traineeDetailSchema) })
  @ApiErrors(401, 403, 404)
  async detail(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
  ) {
    const detail = await this.queries.detail(actor, userId);

    if (!detail) {
      throw notFoundError("TRAINEE_NOT_FOUND", MEMBER_MESSAGES.NOT_FOUND);
    }
    return detail;
  }

  // Scope only: hiding is a view setting, not an access rule, for deletes.
  @Delete(":userId")
  @Admin()
  @ScopedToTrainee({ ignoreHidden: true })
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Trainee and their data deleted" })
  @ApiErrors(401, 403, 404)
  async remove(@Param("userId", idParam) userId: number) {
    await this.trainees.remove(userId);
  }

  @Patch(":userId/email")
  @Admin()
  @ScopedToTrainee()
  @HttpCode(204)
  @ApiBody({
    schema: toOpenApiSchema(changeTraineeEmailRequestSchema, "input"),
  })
  @ApiNoContentResponse({ description: "Email changed" })
  @ApiErrors(400, 401, 403, 404, 409)
  async changeEmail(
    @Param("userId", idParam) userId: number,
    @Body({ schema: changeTraineeEmailRequestSchema })
    body: ChangeTraineeEmailRequest,
  ) {
    await this.trainees.changeEmail(userId, body.email);
  }

  @Post(":userId/password-reset")
  @Admin()
  @ScopedToTrainee()
  @HttpCode(200)
  @ApiOkResponse({
    schema: toOpenApiSchema(passwordResetResponseSchema),
    description: "The new password is shown this once; open sessions end",
  })
  @ApiErrors(400, 401, 403, 404)
  resetPassword(@Param("userId", idParam) userId: number) {
    return this.trainees.resetPassword(userId);
  }

  @Put(":userId/pt")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiBody({ schema: toOpenApiSchema(assignTraineePtRequestSchema, "input") })
  @ApiNoContentResponse({ description: "PT assigned (null clears it)" })
  @ApiErrors(400, 401, 403, 404)
  async assignPt(
    @Param("userId", idParam) userId: number,
    @Body({ schema: assignTraineePtRequestSchema })
    body: AssignTraineePtRequest,
  ) {
    await this.trainees.assignPt(userId, body.ptAdminId);
  }
}
