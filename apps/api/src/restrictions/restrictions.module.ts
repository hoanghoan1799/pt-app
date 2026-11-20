import { Module } from "@nestjs/common";

import { RestrictedWriteGuard } from "./restriction.guard.js";
import { RestrictionsController } from "./restrictions.controller.js";
import { RestrictionQueries } from "./restrictions.queries.js";
import { RestrictionsService } from "./restrictions.service.js";

// Super admin blocks on trainees (company "admin block user"). Enforcement is
// spread on purpose: the session load and the login (auth), the guarded write
// routes (@RefuseRestricted() from restriction.guard.ts) and the "suspended is
// hidden" reads (suspendedUserSql in restriction.sql.ts), none of which need
// this module's providers.
@Module({
  controllers: [RestrictionsController],
  providers: [RestrictionsService, RestrictionQueries, RestrictedWriteGuard],
  exports: [RestrictionQueries, RestrictedWriteGuard],
})
export class RestrictionsModule {}
