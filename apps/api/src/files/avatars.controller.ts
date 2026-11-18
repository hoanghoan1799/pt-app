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
import { AvatarAccess } from "../social/avatar-access.service.js";
import { avatarVersion } from "./image-rules.js";

const notFound = () =>
  new NotFoundException({ code: "AVATAR_NOT_FOUND", message: "not_found" });

@ApiTags("avatars")
@Controller("avatars")
export class AvatarsController {
  constructor(
    private readonly avatars: AvatarService,
    private readonly access: AvatarAccess,
  ) {}

  // Payloads carry `?v=<version>` URLs, not the image. With a matching `v` the
  // bytes never change and cache for a year; without it the browser revalidates
  // by ETag. Access depends on the viewer, so every response is `private`.
  // A trainee's photo: the trainee, a super admin, the PT of their workspace,
  // and trainees who can see them socially (AvatarAccess). The PT team's
  // photos: any admin, and a trainee once they have a conversation. Anything
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
    if (target.kind === "user") {
      return this.access.canViewUserAvatar(actor, target.id);
    }
    return actor.kind === "admin" || this.avatars.hasConversation(actor.id);
  }
}
