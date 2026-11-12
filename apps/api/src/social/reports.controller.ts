import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  socialIdPathSchema,
  type SocialReportRequest,
  socialReportRequestSchema,
  socialReportsResponseSchema,
  type SocialResolveReportRequest,
  socialResolveReportRequestSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { ApiPathParams } from "../workouts/workouts.openapi.js";
import { toReportResponse } from "./mappers.js";
import { ReportsService } from "./reports.service.js";
import { toSocialActor } from "./social-actor.js";
import { SocialTermsGuard } from "./terms.guard.js";

// Trainees and admins report a post, a comment or a trainee; a super admin
// keeps or deletes the reported content.
@ApiTags("social")
@ApiBearerAuth()
@Controller("social/reports")
@UseGuards(SocialTermsGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  @HttpCode(204)
  @ApiBody({ schema: toOpenApiSchema(socialReportRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Filed (a duplicate is kept as is)" })
  @ApiErrors(400, 401, 403, 404)
  async create(
    @Actor() actor: AuthActor,
    @Body({ schema: socialReportRequestSchema }) body: SocialReportRequest,
  ): Promise<void> {
    await this.reports.create(toSocialActor(actor), body);
  }

  // Open reports, oldest first, each with a preview of what was reported.
  @Get()
  @Roles("super_admin")
  @ApiOkResponse({ schema: toOpenApiSchema(socialReportsResponseSchema) })
  @ApiErrors(401, 403)
  async list(@Actor() actor: AuthActor) {
    const items = (await this.reports.listOpen(toSocialActor(actor))).map(
      toReportResponse,
    );

    return { items, openCount: items.length };
  }

  @Post(":id/resolve")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiPathParams("id")
  @ApiBody({ schema: toOpenApiSchema(socialResolveReportRequestSchema, "input") })
  @ApiNoContentResponse({ description: "Closed with every open report on the target" })
  @ApiErrors(400, 401, 403, 404)
  async resolve(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: { id: number },
    @Body({ schema: socialResolveReportRequestSchema })
    body: SocialResolveReportRequest,
  ): Promise<void> {
    await this.reports.resolve(toSocialActor(actor), params.id, body.resolution);
  }
}
