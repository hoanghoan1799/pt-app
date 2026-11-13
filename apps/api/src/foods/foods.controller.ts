import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  type FoodFormValues,
  type FoodGroupsResponse,
  foodGroupsResponseSchema,
  type FoodListQuery,
  foodListQuerySchema,
  type FoodListResponse,
  foodListResponseSchema,
  foodRequestSchema,
  type FoodResponse,
  foodResponseSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { FoodNotFoundError } from "./foods.errors.js";
import { toFoodResponse } from "./foods.mapper.js";
import { FoodsQueries, MAX_FOOD_ID } from "./foods.queries.js";
import { FoodsService } from "./foods.service.js";

// Missing, archived and malformed ids are all "not found", like the web.
const parseFoodId = (raw: string) => {
  const id = /^\d{1,10}$/.test(raw) ? Number(raw) : NaN;

  if (!Number.isInteger(id) || id < 1 || id > MAX_FOOD_ID) {
    throw new FoodNotFoundError();
  }
  return id;
};

// The shared food library. HTTP only: rules in FoodsService, reads in
// FoodsQueries. Everyone signed in reads; only a super admin writes.
@ApiTags("foods")
@Controller("foods")
export class FoodsController {
  constructor(
    private readonly foods: FoodsService,
    private readonly queries: FoodsQueries,
  ) {}

  @Get()
  @ApiBearerAuth()
  @ApiOkResponse({ schema: toOpenApiSchema(foodListResponseSchema) })
  @ApiErrors(400, 401, 403)
  async list(
    @Query({ schema: foodListQuerySchema }) query: FoodListQuery,
  ): Promise<FoodListResponse> {
    const page = await this.queries.list(query);

    return {
      items: page.items.map(toFoodResponse),
      nextCursor: page.nextCursor,
    };
  }

  // The filter chips: only groups that have a food.
  @Get("groups")
  @ApiBearerAuth()
  @ApiOkResponse({ schema: toOpenApiSchema(foodGroupsResponseSchema) })
  @ApiErrors(401, 403)
  async groups(): Promise<FoodGroupsResponse> {
    return { groups: await this.queries.groupsInUse() };
  }

  @Get(":id")
  @ApiBearerAuth()
  @ApiOkResponse({ schema: toOpenApiSchema(foodResponseSchema) })
  @ApiErrors(401, 403, 404)
  async get(@Param("id") id: string): Promise<FoodResponse> {
    const food = await this.queries.findActive(parseFoodId(id));

    if (!food) {
      throw new FoodNotFoundError();
    }
    return toFoodResponse(food);
  }

  @Post()
  @Roles("super_admin")
  @ApiBody({ schema: toOpenApiSchema(foodRequestSchema, "input") })
  @ApiCreatedResponse({ schema: toOpenApiSchema(foodResponseSchema) })
  @ApiErrors(400, 401, 403, 409)
  create(
    @Actor() actor: AuthActor,
    @Body({ schema: foodRequestSchema }) body: FoodFormValues,
  ): Promise<FoodResponse> {
    return this.foods.create(actor, body);
  }

  // The whole food is sent, like the web form: no partial update.
  @Patch(":id")
  @Roles("super_admin")
  @ApiBody({ schema: toOpenApiSchema(foodRequestSchema, "input") })
  @ApiOkResponse({ schema: toOpenApiSchema(foodResponseSchema) })
  @ApiErrors(400, 401, 403, 404, 409)
  update(
    @Actor() actor: AuthActor,
    @Param("id") id: string,
    @Body({ schema: foodRequestSchema }) body: FoodFormValues,
  ): Promise<FoodResponse> {
    return this.foods.update(actor, parseFoodId(id), body);
  }

  // "Xóa" archives the food; the row stays for old meal plans.
  @Delete(":id")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Archived" })
  @ApiErrors(401, 403, 404)
  async archive(
    @Actor() actor: AuthActor,
    @Param("id") id: string,
  ): Promise<void> {
    await this.foods.archive(actor, parseFoodId(id));
  }
}
