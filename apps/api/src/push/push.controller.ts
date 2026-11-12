import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  pushConfigResponseSchema,
  type PushSubscribeRequest,
  pushSubscribeRequestSchema,
  pushSubscriptionsResponseSchema,
  type PushUnsubscribeRequest,
  pushUnsubscribeRequestSchema,
} from "@pt/contracts";

import type { AuthActor } from "../auth/actor.js";
import { Actor } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { APP_ENV } from "../config/app-config.module.js";
import type { Env } from "../config/env.schema.js";
import { adminOwnerKey, userOwnerKey } from "./push.recipients.js";
import { PushService } from "./push.service.js";
import { PushSubscriptionStore } from "./push-subscription.store.js";

const ownerKeyOf = (actor: AuthActor) =>
  actor.kind === "admin" ? adminOwnerKey(actor.id) : userOwnerKey(actor.id);

// The devices of the signed-in person. A push only ever fires for events
// addressed to them. Any signed-in trainee or unlocked admin may subscribe.
@ApiTags("push")
@Controller("push")
export class PushController {
  constructor(
    private readonly store: PushSubscriptionStore,
    private readonly push: PushService,
    @Inject(APP_ENV) private readonly env: Env,
  ) {}

  @Get("config")
  @ApiRoute({
    summary: "Is web push on, and the VAPID public key to subscribe with",
    response: pushConfigResponseSchema,
    errors: [401, 403],
  })
  config() {
    const enabled = this.push.isKindEnabled("web");

    return {
      web: {
        enabled,
        publicKey: enabled ? (this.env.VAPID_PUBLIC_KEY ?? null) : null,
      },
    };
  }

  @Post("subscriptions")
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Save this device (a web subscription; the same endpoint moves to the caller)",
    body: pushSubscribeRequestSchema,
    status: 204,
    errors: [400, 401, 403],
  })
  async subscribe(
    @Actor() actor: AuthActor,
    @Body({ schema: pushSubscribeRequestSchema }) body: PushSubscribeRequest,
    @Headers("user-agent") userAgent: string | undefined,
  ) {
    await this.store.save(ownerKeyOf(actor), body, userAgent ?? "");
  }

  @Delete("subscriptions")
  @HttpCode(204)
  @ApiRoute({
    summary: "Forget one of my devices by its endpoint",
    body: pushUnsubscribeRequestSchema,
    status: 204,
    errors: [400, 401, 403],
  })
  async unsubscribe(
    @Actor() actor: AuthActor,
    @Body({ schema: pushUnsubscribeRequestSchema })
    body: PushUnsubscribeRequest,
  ) {
    await this.store.remove(ownerKeyOf(actor), body.endpoint);
  }

  @Get("subscriptions")
  @ApiRoute({
    summary: "My devices",
    response: pushSubscriptionsResponseSchema,
    errors: [401, 403],
  })
  async list(@Actor() actor: AuthActor) {
    const rows = await this.store.listFor(ownerKeyOf(actor));

    return {
      subscriptions: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        endpoint: row.endpoint,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
        lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
      })),
    };
  }
}
