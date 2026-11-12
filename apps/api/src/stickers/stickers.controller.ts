import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  idParamSchema,
  STICKER_ERRORS,
  STICKER_GIPHY_QUERY_MAX_LENGTH,
  stickerCustomListResponseSchema,
  stickerCustomResponseSchema,
  type StickerGiphyQuery,
  stickerGiphyQuerySchema,
  stickerGiphyResponseSchema,
  stickerNormalizeGiphyQuery,
} from "@pt/contracts";
import type { Request, Response } from "express";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";

import type { AuthActor } from "../auth/actor.js";
import { Actor } from "../auth/decorators/index.js";
import { chatCustomStickerUrl } from "../chat/chat.mapper.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import {
  CustomStickersService,
  stickerOwnerOf,
} from "./custom-stickers.service.js";
import {
  GiphyProxy,
  GiphyRateLimitedError,
  GiphyUnavailableError,
} from "./giphy.js";

const idParam = { schema: idParamSchema };
const toView = (id: number) => ({ id, url: chatCustomStickerUrl(id) });

// Personal stickers and the GIPHY proxy. Any signed-in person; a trainee needs
// chat switched on to manage or search stickers.
@ApiTags("stickers")
@Controller("chat/stickers")
export class StickersController {
  constructor(
    private readonly custom: CustomStickersService,
    private readonly giphy: GiphyProxy,
    @InjectPinoLogger(StickersController.name)
    private readonly logger: PinoLogger,
  ) {}

  @Get("custom")
  @ApiRoute({
    summary: "Ids and image URLs of my stickers, newest first",
    response: stickerCustomListResponseSchema,
    errors: [401, 403],
  })
  async list(@Actor() actor: AuthActor) {
    await this.custom.requireChatOn(actor);
    return {
      stickers: (await this.custom.list(stickerOwnerOf(actor))).map(toView),
    };
  }

  @Post("custom")
  @ApiRoute({
    summary:
      "Add a sticker (raw WebP or PNG bytes, 150 KB, at most 100 per person)",
    response: stickerCustomResponseSchema,
    status: 201,
    errors: [400, 401, 403, 409, 413],
  })
  async create(@Actor() actor: AuthActor, @Req() request: Request) {
    await this.custom.requireChatOn(actor);
    const body: unknown = request.body;
    const bytes = Buffer.isBuffer(body) ? body : Buffer.alloc(0);

    return {
      sticker: toView(await this.custom.create(stickerOwnerOf(actor), bytes)),
    };
  }

  // 404 for anyone who is neither the owner nor on the other side of a
  // conversation it was sent in (never 403, so ids reveal nothing).
  @Get("custom/:id")
  @ApiRoute({
    summary: "The sticker image",
    also: [{ status: 200, description: "image/webp or image/png" }],
    errors: [400, 401, 404],
  })
  async image(
    @Actor() actor: AuthActor,
    @Param("id", idParam) id: number,
    @Res() res: Response,
  ) {
    const file = await this.custom.serve(actor, id);

    res
      .status(200)
      .set({
        "Content-Type": file.mime,
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      })
      .send(file.bytes);
  }

  @Delete("custom/:id")
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Remove one of my stickers (one already sent is only hidden from my list)",
    errors: [400, 401, 403, 404],
  })
  async remove(@Actor() actor: AuthActor, @Param("id", idParam) id: number) {
    await this.custom.requireChatOn(actor);
    await this.custom.remove(stickerOwnerOf(actor), id);
  }

  // `q` empty = trending. Without GIPHY_API_KEY the answer is 200
  // { enabled: false } so the client hides the tab.
  @Get("giphy")
  @ApiRoute({
    summary: "GIPHY sticker search / trending through the server (cached)",
    response: stickerGiphyResponseSchema,
    errors: [400, 401, 403, 429, 502],
  })
  async search(
    @Actor() actor: AuthActor,
    @Query({ schema: stickerGiphyQuerySchema }) query: StickerGiphyQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set("Cache-Control", "no-store");
    await this.custom.requireChatOn(actor);
    if (!this.giphy.enabled) {
      return { enabled: false, stickers: [] };
    }
    const q = stickerNormalizeGiphyQuery(
      query.q,
      STICKER_GIPHY_QUERY_MAX_LENGTH,
    );

    if (q === null) {
      throw new HttpException(
        { code: "INVALID_QUERY", message: STICKER_ERRORS.GENERIC },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      return {
        enabled: true,
        stickers: await this.giphy.search(`${actor.kind}:${actor.id}`, q),
      };
    } catch (error) {
      if (error instanceof GiphyRateLimitedError) {
        throw new HttpException(
          {
            code: "RATE_LIMITED",
            message: "Bạn thao tác quá nhanh. Thử lại sau.",
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      if (error instanceof GiphyUnavailableError) {
        // The message carries no URL, so the key never reaches a log.
        this.logger.warn({ reason: error.message }, "GIPHY unavailable");
        throw new HttpException(
          {
            code: "GIPHY_UNAVAILABLE",
            message: "GIPHY tạm thời không dùng được.",
          },
          HttpStatus.BAD_GATEWAY,
        );
      }
      throw error;
    }
  }
}
