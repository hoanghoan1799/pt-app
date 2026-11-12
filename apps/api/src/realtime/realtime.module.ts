import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ChatModule } from "../chat/chat.module.js";
import { ChatGateway } from "./chat.gateway.js";
import { PresenceRegistry } from "./presence.registry.js";
import { PresenceService } from "./presence.service.js";
import { RealtimeAudience } from "./realtime.audience.js";
import { RealtimeAuth } from "./realtime.auth.js";
import { RealtimeController } from "./realtime.controller.js";
import { RealtimeHub } from "./realtime.hub.js";
import { RealtimeListeners } from "./realtime.listeners.js";
import { TicketStore } from "./ticket.store.js";
import { TypingService } from "./typing.service.js";

// Socket.IO gateway (`/chat` namespace), presence and the typing relay. Chat,
// DMs and sessions only emit domain events; this module turns them into
// socket events. Single instance: see RealtimeIoAdapter for the Redis adapter.
@Module({
  imports: [AuthModule, ChatModule],
  controllers: [RealtimeController],
  providers: [
    ChatGateway,
    RealtimeAuth,
    RealtimeAudience,
    RealtimeHub,
    RealtimeListeners,
    TicketStore,
    PresenceRegistry,
    PresenceService,
    TypingService,
  ],
  exports: [RealtimeHub, PresenceService],
})
export class RealtimeModule {}
