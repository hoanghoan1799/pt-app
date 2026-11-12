import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { AdminsModule } from "./admins/admins.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ClockModule } from "./common/clock.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { createLoggerModule } from "./common/logging/logging.module.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { FoodsModule } from "./foods/foods.module.js";
import { HealthController } from "./health/health.controller.js";
import { SocialModule } from "./social/social.module.js";
import { WorkoutsModule } from "./workouts/workouts.module.js";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    EventEmitterModule.forRoot(),
    createLoggerModule(),
    DatabaseModule,
    AuthModule,
    AdminsModule,
    WorkoutsModule,
    FoodsModule,
    SocialModule,
  ],
  controllers: [HealthController],
  // Registered globally in configureApp(): APP_FILTER would miss the 404 of
  // unmatched routes.
  providers: [AllExceptionsFilter],
})
export class AppModule {}
