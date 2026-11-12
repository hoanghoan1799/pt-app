import { Module } from "@nestjs/common";

import { AdminsModule } from "./admins/admins.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ClockModule } from "./common/clock.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { createLoggerModule } from "./common/logging/logging.module.js";
import { AppConfigModule } from "./config/app-config.module.js";
import { ContactAliasesModule } from "./contact-aliases/contact-aliases.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { FilesModule } from "./files/files.module.js";
import { HealthController } from "./health/health.controller.js";
import { UsersModule } from "./users/users.module.js";

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
  ],
  controllers: [HealthController],
  // Registered globally in configureApp(): APP_FILTER would miss the 404 of
  // unmatched routes.
  providers: [AllExceptionsFilter],
})
export class AppModule {}
