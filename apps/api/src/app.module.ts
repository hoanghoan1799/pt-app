import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";

import { AdminsModule } from "./admins/admins.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { ClockModule } from "./common/clock.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { createLoggerModule } from "./common/logging/logging.module.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { ContactAliasesModule } from "./contact-aliases/contact-aliases.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DmModule } from "./dm/dm.module.js";
import { FilesModule } from "./files/files.module.js";
import { FoodsModule } from "./foods/foods.module.js";
import { HealthController } from "./health/health.controller.js";
import { NutritionModule } from "./nutrition/nutrition.module.js";
import { StickersModule } from "./stickers/stickers.module.js";
import { UsersModule } from "./users/users.module.js";
import { WorkoutsModule } from "./workouts/workouts.module.js";

@Module({
  imports: [
    AppConfigModule,
    ClockModule,
    createLoggerModule(),
    DatabaseModule,
    AuthModule,
    AdminsModule,
    UsersModule,
    ContactAliasesModule,
    FilesModule,
    WorkoutsModule,
    FoodsModule,
    NutritionModule,
    // Domain events (chat.message.sent, ...) for the realtime gateway and push.
    EventEmitterModule.forRoot(),
    ChatModule,
    StickersModule,
    DmModule,
  ],
  controllers: [HealthController],
  // Registered globally in configureApp(): APP_FILTER would miss the 404 of
  // unmatched routes.
  providers: [AllExceptionsFilter],
})
export class AppModule {}
