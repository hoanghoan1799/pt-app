import type { PushPayload } from "@pt/contracts";
import { vi } from "vitest";

import type {
  PushSender,
  PushSendResult,
  StoredPushSubscription,
} from "../../src/push/push-sender.js";

// A sender that records what it was asked to deliver and never touches the
// network. `answers` scripts the result per endpoint (default ok).
export class FakeWebSender implements PushSender {
  readonly kind = "web" as const;
  enabled = true;
  readonly calls: {
    subscription: StoredPushSubscription;
    payload: PushPayload;
  }[] = [];
  readonly answers = new Map<string, PushSendResult[]>();

  send(subscription: StoredPushSubscription, payload: PushPayload) {
    this.calls.push({ subscription, payload });
    return Promise.resolve(
      this.answers.get(subscription.endpoint)?.shift() ?? "ok",
    );
  }

  to(endpoint: string) {
    return this.calls.filter((call) => call.subscription.endpoint === endpoint);
  }

  reset() {
    this.calls.length = 0;
    this.answers.clear();
  }

  // Resolves once `count` deliveries were attempted (pushes run after the
  // response, so tests wait for them).
  async waitForCalls(count: number) {
    await vi.waitFor(
      () => {
        if (this.calls.length < count) {
          throw new Error(`Only ${this.calls.length} of ${count} pushes yet`);
        }
      },
      { timeout: 4000, interval: 25 },
    );
  }
}

let counter = 0;

export const newEndpoint = () =>
  `https://fcm.googleapis.com/fcm/send/device-${Date.now().toString(36)}-${(counter += 1)}`;

export const subscriptionBody = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "p256dh-key", auth: "auth-secret" },
});
