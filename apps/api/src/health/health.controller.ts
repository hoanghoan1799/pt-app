import { Controller, Get, Res } from "@nestjs/common";
import {
  ApiOkResponse,
  ApiServiceUnavailableResponse,
  ApiTags,
} from "@nestjs/swagger";
import { InjectDataSource } from "@nestjs/typeorm";
import type { Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { DataSource } from "typeorm";

import { toOpenApiSchema } from "../common/openapi/zod-schema.js";
import { type HealthResponse, healthResponseSchema } from "./health.schema.js";

const DB_PING_TIMEOUT_MS = 2000;

const healthSchema = toOpenApiSchema(healthResponseSchema);

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectPinoLogger(HealthController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get()
  @ApiOkResponse({ schema: healthSchema, description: "API and database up" })
  @ApiServiceUnavailableResponse({
    schema: healthSchema,
    description: "The database does not answer",
  })
  async check(
    @Res({ passthrough: true }) response: Response,
  ): Promise<HealthResponse> {
    const db = await this.pingDatabase();

    if (db === "down") {
      response.status(503);
      return { status: "error", db };
    }
    return { status: "ok", db };
  }

  private async pingDatabase(): Promise<"ok" | "down"> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("database ping timed out")),
            DB_PING_TIMEOUT_MS,
          );
        }),
      ]);
      return "ok";
    } catch (error) {
      // The cause stays in the log; the response only says "down".
      this.logger.warn({ err: error }, "Health check: database is down");
      return "down";
    } finally {
      clearTimeout(timer);
    }
  }
}
