import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  adminAccountListResponseSchema,
  adminAccountSchema,
  adminProfileResponseSchema,
  avatarResponseSchema,
  chatColorResponseSchema,
  type CreatePtRequest,
  createPtRequestSchema,
  presenceHiddenResponseSchema,
  type SetAdminVerifiedRequest,
  setAdminVerifiedRequestSchema,
  type SetAvatarRequest,
  setAvatarRequestSchema,
  type SetChatColorRequest,
  setChatColorRequestSchema,
  type SetPresenceHiddenRequest,
  setPresenceHiddenRequestSchema,
} from "@pt/contracts";
import { z } from "zod";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { AvatarService } from "../files/avatar.service.js";
import { AdminsService } from "./admins.service.js";

const idParam = { schema: z.coerce.number().int().positive() };

// PT and admin accounts: super admin only.
@ApiTags("admins")
@Controller()
export class AdminAccountsController {
  constructor(private readonly admins: AdminsService) {}

  @Get("pts")
  @Roles("super_admin")
  @ApiOkResponse({ schema: toOpenApiSchema(adminAccountListResponseSchema) })
  @ApiErrors(401, 403)
  async list() {
    return { accounts: await this.admins.listAccounts() };
  }

  @Post("pts")
  @Roles("super_admin")
  @ApiBody({ schema: toOpenApiSchema(createPtRequestSchema, "input") })
  @ApiCreatedResponse({ schema: toOpenApiSchema(adminAccountSchema) })
  @ApiErrors(400, 401, 403, 409)
  create(@Body({ schema: createPtRequestSchema }) body: CreatePtRequest) {
    return this.admins.createPt(body);
  }

  // The blue tick of any admin account.
  @Put("admins/:adminId/verified")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiBody({ schema: toOpenApiSchema(setAdminVerifiedRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Tick granted or removed" })
  @ApiErrors(400, 401, 403, 404)
  async setVerified(
    @Param("adminId", idParam) adminId: number,
    @Body({ schema: setAdminVerifiedRequestSchema })
    body: SetAdminVerifiedRequest,
  ) {
    await this.admins.setVerified(adminId, body.verified);
  }
}

// The signed-in admin's own profile and settings.
@ApiTags("admins")
@Controller("admins/me")
export class AdminsMeController {
  constructor(
    private readonly admins: AdminsService,
    private readonly avatars: AvatarService,
  ) {}

  @Get()
  @Admin()
  @ApiOkResponse({ schema: toOpenApiSchema(adminProfileResponseSchema) })
  @ApiErrors(401, 403, 404)
  profile(@Actor() actor: AdminActor) {
    return this.admins.profile(actor.id);
  }

  @Put("avatar")
  @Admin()
  @ApiBody({ schema: toOpenApiSchema(setAvatarRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(avatarResponseSchema) })
  @ApiErrors(400, 401, 403, 413)
  async setAvatar(
    @Actor() actor: AdminActor,
    @Body({ schema: setAvatarRequestSchema }) body: SetAvatarRequest,
  ) {
    return {
      avatarUrl: await this.avatars.set("admin", actor.id, body.dataUrl),
    };
  }

  @Delete("avatar")
  @Admin()
  @ApiOkResponse({ schema: toOpenApiSchema(avatarResponseSchema) })
  @ApiErrors(401, 403)
  async removeAvatar(@Actor() actor: AdminActor) {
    await this.avatars.clear("admin", actor.id);
    return { avatarUrl: null };
  }

  @Put("chat-color")
  @Admin()
  @ApiBody({ schema: toOpenApiSchema(setChatColorRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(chatColorResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  setChatColor(
    @Actor() actor: AdminActor,
    @Body({ schema: setChatColorRequestSchema }) body: SetChatColorRequest,
  ) {
    return this.admins.setChatColor(actor.id, body.color);
  }

  @Put("presence-hidden")
  @Admin()
  @ApiBody({
    schema: toOpenApiSchema(setPresenceHiddenRequestSchema, "input"),
  })
  @ApiOkResponse({ schema: toOpenApiSchema(presenceHiddenResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  setPresenceHidden(
    @Actor() actor: AdminActor,
    @Body({ schema: setPresenceHiddenRequestSchema })
    body: SetPresenceHiddenRequest,
  ) {
    return this.admins.setPresenceHidden(actor.id, body.isHidden);
  }
}
