import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

// Publishes after the commit and waits for the listeners, so the notification
// rows exist when the response goes out (like the web, which wrote them inline).
// A failing listener is logged and never fails the action that was committed.
@Injectable()
export class SocialEventsPublisher {
  private readonly logger = new Logger(SocialEventsPublisher.name);

  constructor(private readonly emitter: EventEmitter2) {}

  async publish(event: string, payload: object): Promise<void> {
    try {
      await this.emitter.emitAsync(event, payload);
    } catch (error) {
      this.logger.error(
        `Listener of ${event} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
