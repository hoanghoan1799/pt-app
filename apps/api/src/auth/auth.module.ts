import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";

import { Admin } from "../database/entities/admin.entity.js";
import { User } from "../database/entities/user.entity.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { CREDENTIAL_STRATEGIES } from "./credential.strategy.js";
import { PtScopeGuard } from "./guards/pt-scope.guard.js";
import { RolesGuard } from "./guards/roles.guard.js";
import { SessionGuard } from "./guards/session.guard.js";
import { LoginLimiter } from "./login-limiter.service.js";
import { LoginThrottlerModule } from "./login-throttler.module.js";
import { PasswordController } from "./password.controller.js";
import { PasswordHasher } from "./password-hash.js";
import { PtScopePolicy } from "./policies/pt-scope.policy.js";
import { SessionQueries } from "./sessions.queries.js";
import { SessionsService } from "./sessions.service.js";
import { AdminPasscodeStrategy } from "./strategies/admin-passcode.strategy.js";
import { PasswordStrategy } from "./strategies/password.strategy.js";
import { TraineeScopeQueries } from "./trainee-scope.queries.js";

@Module({
  imports: [TypeOrmModule.forFeature([Admin, User]), LoginThrottlerModule],
  controllers: [AuthController, PasswordController],
  providers: [
    AuthService,
    SessionsService,
    SessionQueries,
    LoginLimiter,
    PasswordHasher,
    PtScopePolicy,
    TraineeScopeQueries,
    PasswordStrategy,
    AdminPasscodeStrategy,
    // Every strategy under one token. A GoogleStrategy or PasskeyStrategy is
    // one more class here and one more entry in `inject`; nothing else changes.
    {
      provide: CREDENTIAL_STRATEGIES,
      useFactory: (...strategies: unknown[]) => strategies,
      inject: [PasswordStrategy, AdminPasscodeStrategy],
    },
    // The chain of responsibility, in order: who -> what role -> which trainee.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PtScopeGuard },
  ],
  exports: [
    // The PT scope rules, for modules whose URLs name a child resource.
    PtScopePolicy,
    TraineeScopeQueries,
    SessionsService,
    SessionQueries,
    LoginLimiter,
    PasswordHasher,
    AdminPasscodeStrategy,
    LoginThrottlerModule,
    // Feature modules ask the same scope questions as the PtScopeGuard.
    PtScopePolicy,
    TraineeScopeQueries,
  ],
})
export class AuthModule {}
