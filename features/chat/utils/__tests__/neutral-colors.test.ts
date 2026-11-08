import { afterEach, describe, expect, it, vi } from "vitest";

import {
  loadNeutralColors,
  NEUTRAL_COLORS_EVENT,
  NEUTRAL_COLORS_KEY,
  parseNeutralColors,
  saveNeutralColors,
  subscribeNeutralColors,
} from "@/features/chat/utils/neutral-colors";

const stubWindow = (storage: Partial<Storage>) => {
  const target = new EventTarget();

  vi.stubGlobal("window", {
    localStorage: storage,
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  });
};

const memoryStorage = () => {
  const data = new Map<string, string>();

  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseNeutralColors", () => {
  it("is true only for the exact text 1", () => {
    expect(parseNeutralColors("1")).toBe(true);
  });

  it.each([["0"], [null], ["true"], [""]])("is false for %j", (raw) => {
    expect(parseNeutralColors(raw)).toBe(false);
  });
});

describe("loadNeutralColors / saveNeutralColors", () => {
  it("round-trips on and off, storing 1 under the key", () => {
    const storage = memoryStorage();

    stubWindow(storage);
    expect(loadNeutralColors()).toBe(false);
    saveNeutralColors(true);
    expect(storage.data.get(NEUTRAL_COLORS_KEY)).toBe("1");
    expect(loadNeutralColors()).toBe(true);
    saveNeutralColors(false);
    expect(storage.data.has(NEUTRAL_COLORS_KEY)).toBe(false);
    expect(loadNeutralColors()).toBe(false);
  });

  it("reads false and does not throw when storage throws", () => {
    const boom = () => {
      throw new Error("blocked");
    };

    stubWindow({ getItem: boom, setItem: boom, removeItem: boom });
    expect(loadNeutralColors()).toBe(false);
    expect(() => saveNeutralColors(true)).not.toThrow();
    expect(() => saveNeutralColors(false)).not.toThrow();
  });
});

describe("subscribeNeutralColors", () => {
  it("notifies on a write and stops after unsubscribe", () => {
    stubWindow(memoryStorage());
    const onChange = vi.fn();
    const unsubscribe = subscribeNeutralColors(onChange);

    saveNeutralColors(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    saveNeutralColors(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("ignores storage events for other keys", () => {
    stubWindow(memoryStorage());
    const onChange = vi.fn();

    subscribeNeutralColors(onChange);
    const other = Object.assign(new Event("storage"), { key: "other" });
    const mine = Object.assign(new Event("storage"), {
      key: NEUTRAL_COLORS_KEY,
    });

    window.dispatchEvent(other);
    expect(onChange).not.toHaveBeenCalled();
    window.dispatchEvent(mine);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(NEUTRAL_COLORS_EVENT).toBe("pt-app:neutral-colors-change");
  });
});
