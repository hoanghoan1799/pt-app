import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Put,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  type ActiveRestrictionResponse,
  activeRestrictionSchema,
  type BlockUserRequest,
  blockUserRequestSchema,
  idParamSchema,
  type TraineeRestrictionResponse,
  traineeRestrictionResponseSchema,
} from "@pt/contracts";
import { z } from "zod";

import type { AdminActor } from "../auth/actor.js";
import { Actor, Roles, ScopedToTrainee } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import type { ActiveRestriction } from "./restriction.sql.js";
import { RestrictionQueries } from "./restrictions.queries.js";
import { RestrictionsService } from "./restrictions.service.js";

const idParam = { schema: idParamSchema };

const iso = (date: Date) => date.toISOString();

const toActiveResponse = (
  row: ActiveRestriction,
): ActiveRestrictionResponse => ({
  id: row.id,
  level: row.level,
  until: row.until ? iso(row.until) : null,
  reason: row.reason,
  createdAt: iso(row.createdAt),
});

// Spec D1/D2: only a super admin blocks, re-blocks and lifts, and only a
// super admin reads a trainee's block (a PT gets 403 from the RolesGuard).
// The PT scope guard answers 404 for a missing trainee. Hiding a trainee is a
// view setting, so the writes ignore it (like the member delete).
@ApiTags("restrictions")
@Controller("trainees/:userId/restriction")
export class RestrictionsController {
  constructor(
    private readonly restrictions: RestrictionsService,
    private readonly queries: RestrictionQueries,
  ) {}

  @Get()
  @Roles("super_admin")
  @ScopedToTrainee()
  @ApiRoute({
    summary: "The trainee's active block and their block history",
    response: traineeRestrictionResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async get(
    @Param("userId", idParam) userId: number,
  ): Promise<TraineeRestrictionResponse> {
    const [active, history] = await Promise.all([
      this.queries.findActive(userId),
      this.queries.history(userId),
    ]);

    return {
      restriction: active ? toActiveResponse(active) : null,
      history: history.map((row) => ({
        ...toActiveResponse(row),
        createdBy: row.createdBy,
        liftedAt: row.liftedAt ? iso(row.liftedAt) : null,
        liftedBy: row.liftedBy,
        active: row.active,
      })),
    };
  }

  @Put()
  @Roles("super_admin")
  @ScopedToTrainee({ ignoreHidden: true })
  @ApiRoute({
    summary:
      "Block the trainee (restricted or suspended); an active block is lifted first and kept as history",
    body: blockUserRequestSchema,
    response: z.object({ restriction: activeRestrictionSchema }),
    errors: [400, 401, 403, 404],
  })
  async block(
    @Actor() admin: AdminActor,
    @Param("userId", idParam) userId: number,
    @Body({ schema: blockUserRequestSchema }) body: BlockUserRequest,
  ) {
    return {
      restriction: toActiveResponse(
        await this.restrictions.block(admin, userId, body),
      ),
    };
  }

  @Delete()
  @Roles("super_admin")
  @ScopedToTrainee({ ignoreHidden: true })
  @HttpCode(204)
  @ApiRoute({
    summary: "Lift the trainee's active block early",
    status: 204,
    errors: [400, 401, 403, 404, 409],
  })
  async lift(
    @Actor() admin: AdminActor,
    @Param("userId", idParam) userId: number,
  ) {
    await this.restrictions.lift(admin, userId);
  }
}
