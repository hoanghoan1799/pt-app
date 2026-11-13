import { Module } from "@nestjs/common";

import { FoodFactsService } from "./food-facts.service.js";
import { FoodsController } from "./foods.controller.js";
import { FoodsPolicy } from "./foods.policy.js";
import { FoodsQueries } from "./foods.queries.js";
import { FoodsService } from "./foods.service.js";

// Guards (session, roles) are global, from AuthModule. Meal plans and logs use the
// exported FoodFactsService, never the entity.
@Module({
  controllers: [FoodsController],
  providers: [FoodsService, FoodsQueries, FoodsPolicy, FoodFactsService],
  exports: [FoodsService, FoodsQueries, FoodFactsService],
})
export class FoodsModule {}
