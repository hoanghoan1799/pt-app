import { Body, Controller, Delete, Get, HttpCode, Put } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  avatarResponseSchema,
  chatColorResponseSchema,
  type SetAvatarRequest,
  setAvatarRequestSchema,
  type SetBioRequest,
  setBioRequestSchema,
  type SetChatColorRequest,
  setChatColorRequestSchema,
  type SetLocaleRequest,
  setLocaleRequestSchema,
  userProfileResponseSchema,
} from "@pt/contracts";

import type { AuthActor, UserActor } from "../auth/actor.js";
import {
  Actor,
  AllowLocked,
  Roles,
  User as TraineeOnly,
} from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { AvatarService } from "../files/avatar.service.js";
import { ProfileService } from "./profile.service.js";

// The signed-in trainee's own profile and settings. The id always comes from
// the session. (Password change lives in the auth module.)
@ApiTags("users")
@Controller("users/me")
export class UsersMeController {
  constructor(
    private readonly profile: ProfileService,
    private readonly avatars: AvatarService,
  ) {}

  @Get()
  @TraineeOnly()
  @ApiOkResponse({ schema: toOpenApiSchema(userProfileResponseSchema) })
  @ApiErrors(401, 403, 404)
  profileOf(@Actor() actor: UserActor) {
    return this.profile.userProfile(actor.id);
  }

  @Put("avatar")
  @TraineeOnly()
  @ApiBody({ schema: toOpenApiSchema(setAvatarRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(avatarResponseSchema) })
  @ApiErrors(400, 401, 403, 413)
  async setAvatar(
    @Actor() actor: UserActor,
    @Body({ schema: setAvatarRequestSchema }) body: SetAvatarRequest,
  ) {
    return {
      avatarUrl: await this.avatars.set("user", actor.id, body.dataUrl),
    };
  }

  @Delete("avatar")
  @TraineeOnly()
  @ApiOkResponse({ schema: toOpenApiSchema(avatarResponseSchema) })
  @ApiErrors(401, 403)
  async removeAvatar(@Actor() actor: UserActor) {
    await this.avatars.clear("user", actor.id);
    return { avatarUrl: null };
  }

  // null = back to the default colour. Refused while chat is locked.
  @Put("chat-color")
  @TraineeOnly()
  @ApiBody({ schema: toOpenApiSchema(setChatColorRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(chatColorResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  setChatColor(
    @Actor() actor: UserActor,
    @Body({ schema: setChatColorRequestSchema }) body: SetChatColorRequest,
  ) {
    return this.profile.setChatColor(actor.id, body.color);
  }
}

// Settings both kinds of actor keep on their account.
@ApiTags("me")
@Controller("me")
@Roles("super_admin", "pt", "trainee")
export class MeController {
  constructor(private readonly profile: ProfileService) {}

  // The language picker also shows on the lock screen, so a locked admin may
  // call it.
  @Put("locale")
  @AllowLocked()
  @HttpCode(200)
  @ApiBody({ schema: toOpenApiSchema(setLocaleRequestSchema, "input") })
  @ApiOkResponse({ description: "Saved language" })
  @ApiErrors(400, 401)
  setLocale(
    @Actor() actor: AuthActor,
    @Body({ schema: setLocaleRequestSchema }) body: SetLocaleRequest,
  ) {
    return this.profile.setLocale(actor, body.locale);
  }

  @Put("bio")
  @ApiBody({ schema: toOpenApiSchema(setBioRequestSchema, "input") })
  @ApiOkResponse({ description: "Saved bio (null when cleared)" })
  @ApiErrors(400, 401, 403)
  setBio(
    @Actor() actor: AuthActor,
    @Body({ schema: setBioRequestSchema }) body: SetBioRequest,
  ) {
    return this.profile.setBio(actor, body.bio);
  }
}
