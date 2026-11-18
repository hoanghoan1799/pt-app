import { Module } from "@nestjs/common";

import { ExpiredRowsPurge } from "./expired-rows-purge.service.js";

// Periodic clean-up of rows that expired by themselves.
@Module({ providers: [ExpiredRowsPurge] })
export class HousekeepingModule {}
