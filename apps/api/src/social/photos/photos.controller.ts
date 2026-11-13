import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import {
  SOCIAL_POST_PHOTO_MAX_BYTES,
  socialIdPathSchema,
  socialPhotoUploadResponseSchema,
} from "@pt/contracts";
import type { Request, Response } from "express";

import type { AuthActor } from "../../auth/actor.js";
import { Actor } from "../../auth/decorators/index.js";
import { ApiErrors } from "../../common/openapi/api-errors.js";
import { toOpenApiSchema } from "../../common/openapi/zod-schema.js";
import { ApiPathParams } from "../../workouts/workouts.openapi.js";
import { photoTooLarge } from "../social.errors.js";
import { toSocialActor } from "../social-actor.js";
import { SocialTermsGuard } from "../terms.guard.js";
import { PhotosService } from "./photos.service.js";

// The raw bytes of the request body, never more than `max`. A body that is too
// large is drained (up to a hard cap, then the connection is dropped) so the
// client reads the 413 instead of a reset.
const DRAIN_CAP = 8 * 1024 * 1024;

const readBody = (request: Request, max: number): Promise<Buffer> => {
  // The global raw parser (app.setup.ts) has already read image/* bodies.
  if (Buffer.isBuffer(request.body)) {
    const body = request.body as Buffer;

    return body.length > max
      ? Promise.reject(photoTooLarge())
      : Promise.resolve(body);
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= max) {
        chunks.push(chunk);
      } else if (size > DRAIN_CAP) {
        request.destroy();
      }
    });
    request.on("end", () =>
      size > max ? reject(photoTooLarge()) : resolve(Buffer.concat(chunks)),
    );
    request.on("error", reject);
  });
};

@ApiTags("social")
@ApiBearerAuth()
@Controller("social/photos")
@UseGuards(SocialTermsGuard)
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  // POST: the raw image bytes (resized by the client). Type and size are read
  // from the bytes; the photo stays pending until a post uses it. A trainee
  // needs the accepted terms, an admin uploads as themselves.
  @Post()
  @HttpCode(201)
  @ApiConsumes("image/webp", "image/jpeg", "image/png")
  @ApiBody({ schema: { type: "string", format: "binary" } })
  @ApiCreatedResponse({
    schema: toOpenApiSchema(socialPhotoUploadResponseSchema),
  })
  @ApiErrors(400, 401, 403, 413)
  async upload(@Actor() actor: AuthActor, @Req() request: Request) {
    const bytes = await readBody(request, SOCIAL_POST_PHOTO_MAX_BYTES);

    return {
      photo: { id: await this.photos.upload(toSocialActor(actor), bytes) },
    };
  }

  // GET: the photo of a post. 404 unless the post is visible to the viewer,
  // never 403, so ids reveal nothing. The bytes of an id never change.
  @Get(":id")
  @ApiPathParams("id")
  @ApiOkResponse({
    description: "The image bytes",
    content: {
      "image/webp": { schema: { type: "string", format: "binary" } },
      "image/jpeg": { schema: { type: "string", format: "binary" } },
      "image/png": { schema: { type: "string", format: "binary" } },
    },
  })
  @ApiErrors(401, 403, 404)
  async get(
    @Actor() actor: AuthActor,
    @Param({ schema: socialIdPathSchema }) params: { id: number },
    @Res({ passthrough: true }) response: Response,
  ) {
    const photo = await this.photos.findForViewer(
      toSocialActor(actor),
      params.id,
    );

    response.set({
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    return new StreamableFile(photo.bytes);
  }
}
