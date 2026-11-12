import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";
import { buildDataSourceOptions } from "./data-source-options.js";

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [APP_ENV],
      useFactory: (env: Env) => buildDataSourceOptions(env.DATABASE_URL),
    }),
  ],
})
export class DatabaseModule {}
