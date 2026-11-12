import {
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { avatarParamsSchema } from "@pt/contracts";
import type { Response } from "express";

import type { AuthActor } from "../auth/actor.js";
import { Actor, Roles } from "../auth/decorators/index.js";
import { ApiErrors } from "../common/openapi/api-errors.js";
import { AvatarService } from "./avatar.service.js";
import { avatarVersion } from "./image-rules.js";

const notFound = () =>
  new NotFoundException({ code: "AVATAR_NOT_FOUND", message: "not_found" });

@ApiTags("avatars")
@Controller("avatars")
export class AvatarsController {
  constructor(private readonly avatars: AvatarService) {}

  // Payloads carry `?v=<version>` URLs, not the image. With a matching `v` the
  // bytes never change and cache for a year; without it the browser revalidates
  // by ETag. Any admin sees every photo; a trainee sees their own and the PT
  // team's (once they have a conversation), never another trainee's. Anything
  // else answers like a missing photo so ids cannot be probed.
  @Get(":kind/:id")
  @Roles("super_admin", "pt", "trainee")
  @ApiProduces("image/webp", "image/jpeg", "image/png")
  @ApiOkResponse({ description: "The image bytes" })
  @ApiResponse({ status: 304, description: "ETag matches" })
  @ApiErrors(401, 403, 404)
  async get(
    @Actor() actor: AuthActor,
    @Param("kind") rawKind: string,
    @Param("id") rawId: string,
    @Query("v") queryVersion: string | undefined,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const params = avatarParamsSchema.safeParse({ kind: rawKind, id: rawId });

    if (!params.success || !(await this.canView(actor, params.data))) {
      throw notFound();
    }
    const file = await this.avatars.fileOf(params.data.kind, params.data.id);

    if (!file) {
      throw notFound();
    }
    const version = avatarVersion(file.version);
    const etag = `"${version}"`;
    const headers = {
      ETag: etag,
      "Cache-Control":
        queryVersion === version
          ? "private, max-age=31536000, immutable"
          : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
    };

    if (ifNoneMatch === etag) {
      res.status(304).set(headers).end();
      return;
    }
    res
      .status(200)
      .set({ ...headers, "Content-Type": file.mime })
      .send(file.bytes);
  }

  private async canView(
    actor: AuthActor,
    target: { kind: "user" | "admin"; id: number },
  ) {
    if (actor.kind === "admin") {
      return true;
    }
    if (target.kind === "user") {
      return actor.id === target.id;
    }
    return this.avatars.hasConversation(actor.id);
  }
}
