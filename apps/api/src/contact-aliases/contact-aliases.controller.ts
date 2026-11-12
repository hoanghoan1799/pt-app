import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from "@nestjs/common";
import {
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  contactAliasListResponseSchema,
  contactAliasResponseSchema,
  setContactAliasRequestSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { ContactAliasesService } from "./contact-aliases.service.js";

// targetKey: "user:<id>", "admin:<id>" or "pt" (trainees only).
@ApiTags("contact-aliases")
@Controller("contact-aliases")
@Roles("super_admin", "pt", "trainee")
export class ContactAliasesController {
  constructor(private readonly aliases: ContactAliasesService) {}

  @Get()
  @ApiOkResponse({ schema: toOpenApiSchema(contactAliasListResponseSchema) })
  @ApiErrors(401, 403)
  async list(@Actor() actor: AuthActor) {
    return { aliases: await this.aliases.listFor(actor) };
  }

  // An empty alias clears it.
  @Put(":targetKey")
  @ApiBody({ schema: toOpenApiSchema(setContactAliasRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(contactAliasResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  set(
    @Actor() actor: AuthActor,
    @Param("targetKey") targetKey: string,
    @Body() body: { alias?: unknown },
  ) {
    // The alias is validated by the service so the shape error and the length
    // error share one message, like the web action.
    return this.aliases.set(actor, targetKey, body?.alias);
  }

  @Delete(":targetKey")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Alias cleared" })
  @ApiErrors(400, 401, 403)
  async clear(
    @Actor() actor: AuthActor,
    @Param("targetKey") targetKey: string,
  ) {
    await this.aliases.set(actor, targetKey, "");
  }
}
