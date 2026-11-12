import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { PushController } from "./push.controller.js";
import { PushNotifier } from "./push.notifier.js";
import { PushRecipients } from "./push.recipients.js";
import { PushService } from "./push.service.js";
import { PUSH_SENDERS } from "./push-sender.js";
import { PushSubscriptionStore } from "./push-subscription.store.js";
import { WebPushSender } from "./senders/web-push.sender.js";

// Web push. Chat and Social only emit domain events; PushNotifier turns them
// into pushes, PushService sends each through the sender of the device's kind.
// Adding the mobile apps = an ExpoPushSender / FcmPushSender class and one more
// entry in `inject` below; nothing else changes. Without the VAPID_* variables
// the web sender is disabled and nothing is sent.
@Module({
  imports: [AuthModule],
  controllers: [PushController],
  providers: [
    WebPushSender,
    {
      provide: PUSH_SENDERS,
      useFactory: (...senders: unknown[]) => senders,
      inject: [WebPushSender],
    },
    PushSubscriptionStore,
    PushRecipients,
    PushService,
    PushNotifier,
  ],
  exports: [PushService],
})
export class PushModule {}
