import { REALTIME_TICKET_TTL_SECONDS } from "@pt/contracts";
import { describe, expect, it } from "vitest";

import { Clock } from "../common/clock.js";
import { TicketStore } from "./ticket.store.js";

class TestClock extends Clock {
  private current = new Date("2026-11-12T10:00:00.000Z");

  override now() {
    return new Date(this.current);
  }

  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

const setup = () => {
  const clock = new TestClock();

  return { clock, store: new TicketStore(clock) };
};

describe("TicketStore", () => {
  it("hands back the session of a valid ticket, once", () => {
    const { store } = setup();
    const ticket = store.issue("session-1");

    expect(store.consume(ticket)).toBe("session-1");
    expect(store.consume(ticket)).toBeNull();
  });

  it("refuses an unknown ticket and keeps the real one valid", () => {
    const { store } = setup();
    const ticket = store.issue("session-1");

    expect(store.consume("not-a-ticket")).toBeNull();
    expect(store.consume(ticket)).toBe("session-1");
  });

  it("works until the 60 second mark and not after", () => {
    const { clock, store } = setup();
    const early = store.issue("a");
    const late = store.issue("b");

    clock.advance(REALTIME_TICKET_TTL_SECONDS * 1000 - 1);
    expect(store.consume(early)).toBe("a");
    clock.advance(1);
    expect(store.consume(late)).toBeNull();
  });

  it("issues a different ticket each time and never keeps the plain one", () => {
    const { store } = setup();
    const first = store.issue("a");
    const second = store.issue("a");
    const keys = [
      ...(store as unknown as { pending: Map<string, unknown> }).pending.keys(),
    ];

    expect(first).not.toBe(second);
    expect(keys).toHaveLength(2);
    expect(keys.every((key) => /^[0-9a-f]{64}$/.test(key))).toBe(true);
    expect(keys).not.toContain(first);
  });

  it("drops expired tickets when a new one is issued", () => {
    const { clock, store } = setup();

    store.issue("a");
    store.issue("b");
    clock.advance(61_000);
    store.issue("c");
    expect(store.size).toBe(1);
  });
});
