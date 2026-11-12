import { Inject, Injectable } from "@nestjs/common";
import type { PushPayload } from "@pt/contracts";
import webpush from "web-push";

import { APP_ENV } from "../../config/app-config.module.js";
import type { Env } from "../../config/env.schema.js";
import type {
  PushSender,
  PushSendResult,
  StoredPushSubscription,
} from "../push-sender.js";

const PUSH_TTL_SECONDS = 3600;

// 404 / 410: the browser dropped the subscription.
export const isGoneStatus = (statusCode: number | undefined) =>
  statusCode === 404 || statusCode === 410;

// Temporary: no answer at all, throttled, or the push service is down.
export const isRetryableStatus = (statusCode: number | undefined) =>
  statusCode === undefined || statusCode === 429 || statusCode >= 500;

export const classifyWebPushError = (error: unknown): PushSendResult => {
  const statusCode = (error as { statusCode?: number } | null)?.statusCode;

  if (isGoneStatus(statusCode)) {
    return "gone";
  }
  return isRetryableStatus(statusCode) ? "retry" : "failed";
};

// Web Push with the VAPID keys of the environment. Without all three variables
// the sender is disabled and never contacts anything.
@Injectable()
export class WebPushSender implements PushSender {
  readonly kind = "web" as const;
  readonly enabled: boolean;

  constructor(@Inject(APP_ENV) private readonly env: Env) {
    this.enabled = Boolean(
      env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT,
    );
  }

  async send(
    subscription: StoredPushSubscription,
    payload: PushPayload,
  ): Promise<PushSendResult> {
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = this.env;

    if (
      !VAPID_PUBLIC_KEY ||
      !VAPID_PRIVATE_KEY ||
      !VAPID_SUBJECT ||
      !subscription.p256dh ||
      !subscription.auth
    ) {
      return "failed";
    }
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        {
          vapidDetails: {
            subject: VAPID_SUBJECT,
            publicKey: VAPID_PUBLIC_KEY,
            privateKey: VAPID_PRIVATE_KEY,
          },
          TTL: PUSH_TTL_SECONDS,
          urgency: "high",
          topic: payload.tag,
        },
      );
      return "ok";
    } catch (error) {
      return classifyWebPushError(error);
    }
  }
}
