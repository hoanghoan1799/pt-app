import { Module } from "@nestjs/common";

import { FoodsController } from "./foods.controller.js";
import { FoodsPolicy } from "./foods.policy.js";
import { FoodsQueries } from "./foods.queries.js";
import { FoodsService } from "./foods.service.js";

// Guards (session, roles) are global, from AuthModule. Meal plans will use the
// exported service and queries, never the entity.
@Module({
  controllers: [FoodsController],
  providers: [FoodsService, FoodsQueries, FoodsPolicy],
  exports: [FoodsService, FoodsQueries],
})
export class FoodsModule {}
