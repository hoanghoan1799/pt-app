import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import {
  type AdminLoginRequest,
  adminLoginRequestSchema,
  authTokenResponseSchema,
  meResponseSchema,
  sessionListResponseSchema,
  type UserLoginRequest,
  userLoginRequestSchema,
} from "@pt/contracts";
import type { Request } from "express";

import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import type { AuthActor } from "./actor.js";
import { AuthService } from "./auth.service.js";
import { clientContextOf } from "./client-context.js";
import { Actor, AllowLocked, Public } from "./decorators/index.js";
import {
  toAuthTokenResponse,
  toMeResponse,
  toSessionListResponse,
} from "./mappers.js";
import { parseBearer } from "./session-token.js";

const tokenResponse = toOpenApiSchema(authTokenResponseSchema);

// HTTP only: validate, call the service, map to a response.
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(userLoginRequestSchema, "input") })
  @ApiOkResponse({
    schema: tokenResponse,
    description: "Trainee login by email and password; returns the token once",
  })
  @ApiErrors(400, 401, 429)
  async login(
    @Body({ schema: userLoginRequestSchema }) body: UserLoginRequest,
    @Req() request: Request,
  ) {
    const { token, actor } = await this.auth.login(
      "password",
      { subject: "user", email: body.email, password: body.password },
      clientContextOf(request, body),
    );

    return toAuthTokenResponse(token, actor);
  }

  @Post("admin/login")
  @Public()
  @UseGuards(ThrottlerGuard)
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(adminLoginRequestSchema, "input") })
  @ApiOkResponse({
    schema: tokenResponse,
    description: "Admin login by username and password; returns the token once",
  })
  @ApiErrors(400, 401, 429)
  async adminLogin(
    @Body({ schema: adminLoginRequestSchema }) body: AdminLoginRequest,
    @Req() request: Request,
  ) {
    const { token, actor } = await this.auth.login(
      "password",
      { subject: "admin", username: body.username, password: body.password },
      clientContextOf(request, body),
    );

    return toAuthTokenResponse(token, actor);
  }

  @Post("refresh")
  @ApiBearerAuth()
  @AllowLocked()
  @HttpCode(200)
  @ApiOkResponse({
    schema: tokenResponse,
    description: "Rotates the token; the old one stops working",
  })
  @ApiErrors(401)
  async refresh(@Actor() actor: AuthActor, @Req() request: Request) {
    // The guard already accepted this exact header.
    const current = parseBearer(request.headers.authorization) as string;
    const result = await this.auth.refresh(actor, current);

    return toAuthTokenResponse(result.token, result.actor);
  }

  @Post("logout")
  @ApiBearerAuth()
  @AllowLocked()
  @HttpCode(204)
  @ApiNoContentResponse({ description: "The calling session is revoked" })
  @ApiErrors(401)
  async logout(@Actor() actor: AuthActor) {
    await this.auth.logout(actor);
  }

  @Get("me")
  @ApiBearerAuth()
  @AllowLocked()
  @ApiOkResponse({
    schema: toOpenApiSchema(meResponseSchema),
    description: "Who is signed in, role, lock state and the session",
  })
  @ApiErrors(401)
  me(@Actor() actor: AuthActor) {
    return toMeResponse(actor);
  }

  @Get("sessions")
  @ApiBearerAuth()
  @AllowLocked()
  @ApiOkResponse({
    schema: toOpenApiSchema(sessionListResponseSchema),
    description: "Signed-in devices of the caller, most recently used first",
  })
  @ApiErrors(401)
  async sessions(@Actor() actor: AuthActor) {
    return toSessionListResponse(
      await this.auth.listSessions(actor),
      actor.session.id,
    );
  }

  @Delete("sessions/:id")
  @ApiBearerAuth()
  @AllowLocked()
  @HttpCode(204)
  @ApiNoContentResponse({ description: "That device is signed out" })
  @ApiErrors(400, 401, 404)
  async revokeSession(
    @Actor() actor: AuthActor,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    await this.auth.revokeSession(actor, id);
  }
}
