import { TYPING_THROTTLE_MS } from "@pt/contracts";

// At most one typing relay per sender and conversation per interval; the rest
// are dropped silently (typing is best effort, nothing is stored). Keyed by
// socket id so one noisy tab cannot flood a room.
export class TypingLimiter {
  private readonly last = new Map<string, number>();

  constructor(private readonly intervalMs = TYPING_THROTTLE_MS) {}

  allow(socketId: string, conversationId: number, now: number) {
    const key = `${socketId}:${conversationId}`;
    const previous = this.last.get(key);

    // A clock that moved back must not silence the sender forever.
    if (
      previous !== undefined &&
      now >= previous &&
      now - previous < this.intervalMs
    ) {
      return false;
    }
    this.last.set(key, now);
    return true;
  }

  forget(socketId: string) {
    for (const key of this.last.keys()) {
      if (key.startsWith(`${socketId}:`)) {
        this.last.delete(key);
      }
    }
  }
}
