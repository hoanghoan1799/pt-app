import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { ApiBody, ApiNoContentResponse, ApiTags } from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
} from "@pt/contracts";

import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import type { AuthActor } from "./actor.js";
import { AuthService } from "./auth.service.js";
import { Actor, User } from "./decorators/index.js";

@ApiTags("auth")
@Controller("users/me")
export class PasswordController {
  constructor(private readonly auth: AuthService) {}

  // Other devices are signed out; the calling session stays.
  @Post("password")
  @User()
  @UseGuards(ThrottlerGuard)
  @HttpCode(204)
  @ApiBody({ schema: toOpenApiSchema(changePasswordRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Password changed" })
  @ApiErrors(400, 401, 403, 429)
  async changePassword(
    @Actor() actor: AuthActor,
    @Body({ schema: changePasswordRequestSchema }) body: ChangePasswordRequest,
  ) {
    await this.auth.changePassword(actor, body);
  }
}
