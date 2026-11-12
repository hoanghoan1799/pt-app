import { LoggerModule } from "nestjs-pino";

import { APP_ENV } from "../../config/app-config.module.js";
import type { Env } from "../../config/env.schema.js";
import { buildLoggerParams } from "./logger.config.js";

// A function, not a constant: nestjs-pino creates the @InjectPinoLogger
// providers from the classes decorated *so far*, so this must run after every
// controller and filter module has been imported (i.e. inside @Module()).
export const createLoggerModule = () =>
  LoggerModule.forRootAsync({
    inject: [APP_ENV],
    useFactory: (env: Env) => buildLoggerParams(env),
  });
