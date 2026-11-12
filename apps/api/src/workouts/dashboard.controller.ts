import { Controller, Get, Param, Query } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import {
  activityQuerySchema,
  activityResponseSchema,
  dashboardSummaryQuerySchema,
  dashboardSummaryResponseSchema,
  MEMBER_ACTIVITY_LIMIT,
  progressQuerySchema,
  progressResponseSchema,
  RECENT_ACTIVITY_LIMIT,
  traineePathSchema,
} from "@pt/contracts";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Admin, ScopedToTrainee } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { DashboardService } from "./dashboard.service.js";
import type { PtFilter } from "./insights.queries.js";
import {
  toActivityResponse,
  toDashboardSummaryResponse,
  toProgressResponse,
} from "./mappers.js";
import { ApiPathParams, ApiQueries } from "./workouts.openapi.js";

type Limit = { limit?: number };

// Admin dashboard reads. Not scope-guarded as a whole: the lists are filtered
// to the caller's trainees inside the queries.
@ApiTags("dashboard")
@Controller()
@Admin()
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get("dashboard/summary")
  @ApiQueries(
    { name: "week", description: "Any date of the week; default this week" },
    {
      name: "pt",
      description: "none | PT id; super admin only, ignored for a PT",
    },
  )
  @ApiOkResponse({
    schema: toOpenApiSchema(dashboardSummaryResponseSchema),
    description:
      "Week progress per trainee (hidden trainees left out) and the totals",
  })
  @ApiErrors(400, 401, 403)
  async summary(
    @Actor() admin: AdminActor,
    @Query({ schema: dashboardSummaryQuerySchema })
    query: { week?: string; pt: PtFilter },
  ) {
    const result = await this.dashboard.summary(admin, query.week, query.pt);

    return toDashboardSummaryResponse(
      result.weekStart,
      result.members,
      result.summary,
    );
  }

  @Get("dashboard/activity")
  @ApiQueries({ name: "limit", description: "1-50, default 15" })
  @ApiOkResponse({
    schema: toOpenApiSchema(activityResponseSchema),
    description: "Recent completions and personal bests, newest first",
  })
  @ApiErrors(400, 401, 403)
  async activity(
    @Actor() admin: AdminActor,
    @Query({ schema: activityQuerySchema }) query: Limit,
  ) {
    const { items, displayNames } = await this.dashboard.recentActivity(
      admin,
      query.limit ?? RECENT_ACTIVITY_LIMIT,
    );

    return toActivityResponse(items, displayNames);
  }

  @Get("trainees/:userId/activity")
  @ScopedToTrainee()
  @ApiPathParams("userId")
  @ApiQueries({ name: "limit", description: "1-50, default 20" })
  @ApiOkResponse({ schema: toOpenApiSchema(activityResponseSchema) })
  @ApiErrors(400, 401, 403, 404)
  async traineeActivity(
    @Actor() admin: AdminActor,
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Query({ schema: activityQuerySchema }) query: Limit,
  ) {
    const { items, displayNames } = await this.dashboard.traineeActivity(
      admin,
      params.userId,
      query.limit ?? MEMBER_ACTIVITY_LIMIT,
    );

    return toActivityResponse(items, displayNames);
  }

  @Get("trainees/:userId/progress")
  @ScopedToTrainee()
  @ApiPathParams("userId")
  @ApiQueries({ name: "week", description: "Any date of the week" })
  @ApiOkResponse({
    schema: toOpenApiSchema(progressResponseSchema),
    description: "Per exercise link: this week's best against the best before",
  })
  @ApiErrors(400, 401, 403, 404)
  async progress(
    @Param({ schema: traineePathSchema }) params: { userId: number },
    @Query({ schema: progressQuerySchema }) query: { week?: string },
  ) {
    const result = await this.dashboard.progress(params.userId, query.week);

    return toProgressResponse(result.weekStart, result.rows);
  }
}
