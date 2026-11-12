import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  hiddenStatusResponseSchema,
  hiddenUsersResponseSchema,
  type HideUsersRequest,
  hideUsersRequestSchema,
  hideUsersResponseSchema,
} from "@pt/contracts";
import { z } from "zod";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { HiddenUsersService } from "./hidden-users.service.js";

const idParam = { schema: z.coerce.number().int().positive() };

// The calling admin's hidden trainees. Every route needs an unlocked admin
// (the RolesGuard). `POST hidden-users/reveal` lives in AdminPasscodeController.
@ApiTags("admins")
@Controller("admins/me/hidden-users")
export class HiddenUsersController {
  constructor(private readonly hidden: HiddenUsersService) {}

  // Empty unless the session revealed hidden trainees with the passcode.
  @Get()
  @Admin()
  @ApiOkResponse({ schema: toOpenApiSchema(hiddenUsersResponseSchema) })
  @ApiErrors(401, 403)
  async list(@Actor() actor: AdminActor) {
    return { users: await this.hidden.list(actor) };
  }

  @Post()
  @Admin()
  @ApiBody({ schema: toOpenApiSchema(hideUsersRequestSchema, "input") })
  @ApiCreatedResponse({ schema: toOpenApiSchema(hideUsersResponseSchema) })
  @ApiErrors(400, 401, 403)
  async hide(
    @Actor() actor: AdminActor,
    @Body({ schema: hideUsersRequestSchema }) body: HideUsersRequest,
  ) {
    return { hidden: await this.hidden.hide(actor, body.userIds) };
  }

  @Get(":userId")
  @Admin()
  @ApiOkResponse({ schema: toOpenApiSchema(hiddenStatusResponseSchema) })
  @ApiErrors(400, 401, 403)
  async status(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
  ) {
    return { hidden: await this.hidden.isHidden(actor.id, userId) };
  }

  @Delete(":userId")
  @Admin()
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Trainee is visible again" })
  @ApiErrors(400, 401, 403)
  async unhide(
    @Actor() actor: AdminActor,
    @Param("userId", idParam) userId: number,
  ) {
    await this.hidden.unhide(actor.id, userId);
  }
}
