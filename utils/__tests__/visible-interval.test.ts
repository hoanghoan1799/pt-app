import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { startVisibleInterval } from "@/utils/visible-interval";

// A minimal document: visibility state plus visibilitychange listeners.
const makeDocument = () => {
  const listeners = new Set<() => void>();
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: () => void) =>
      listeners.delete(fn),
    setVisibility: (state: DocumentVisibilityState) => {
      doc.visibilityState = state;
      listeners.forEach((fn) => fn());
    },
    listenerCount: () => listeners.size,
  };

  return doc;
};

describe("startVisibleInterval", () => {
  let doc: ReturnType<typeof makeDocument>;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = makeDocument();
    vi.stubGlobal("document", doc);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("ticks every interval while visible, without a first call", () => {
    const callback = vi.fn();

    startVisibleInterval(callback, 1000);
    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("stops ticking while hidden", () => {
    const callback = vi.fn();

    startVisibleInterval(callback, 1000);
    doc.setVisibility("hidden");
    vi.advanceTimersByTime(10_000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("runs once at once on visible, then resumes the interval", () => {
    const callback = vi.fn();

    startVisibleInterval(callback, 1000);
    doc.setVisibility("hidden");
    vi.advanceTimersByTime(5000);
    doc.setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("does not start a timer when created while hidden", () => {
    const callback = vi.fn();

    doc.visibilityState = "hidden";
    startVisibleInterval(callback, 1000);
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
    doc.setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("stop clears the timer and the listener", () => {
    const callback = vi.fn();
    const stop = startVisibleInterval(callback, 1000);

    stop();
    vi.advanceTimersByTime(5000);
    expect(callback).not.toHaveBeenCalled();
    expect(doc.listenerCount()).toBe(0);
  });
});
