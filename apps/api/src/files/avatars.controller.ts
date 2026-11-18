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
import { avatarVersion, isValidAvatarToken } from "./image-rules.js";

const notFound = () =>
  new NotFoundException({ code: "AVATAR_NOT_FOUND", message: "not_found" });

@ApiTags("avatars")
@Controller("avatars")
export class AvatarsController {
  constructor(private readonly avatars: AvatarService) {}

  // Payloads carry signed `?v=<version>&t=<token>` URLs, not the image. The
  // token (HMAC over kind, id and the stored version) is the capability: a
  // valid one serves the photo to any signed-in actor, and the actor's own
  // photo needs none. A missing, wrong or stale token answers like a missing
  // photo so ids cannot be probed. With a matching `v` the bytes never change
  // and cache for a year; without it the browser revalidates by ETag. Always
  // `private`.
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
    @Query("t") token: string | undefined,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const params = avatarParamsSchema.safeParse({ kind: rawKind, id: rawId });

    if (!params.success) {
      throw notFound();
    }
    const { kind, id } = params.data;
    const file = await this.avatars.fileOf(kind, id);

    if (!file) {
      throw notFound();
    }
    const version = avatarVersion(file.version);
    const own =
      actor.kind === (kind === "admin" ? "admin" : "user") && actor.id === id;

    if (!own && !isValidAvatarToken(kind, id, version, token)) {
      throw notFound();
    }
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
}
