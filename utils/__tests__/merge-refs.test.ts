import { describe, expect, it, vi } from "vitest";

import { mergeRefs } from "@/utils/merge-refs";

describe("mergeRefs", () => {
  it("assigns the node to function and object refs", () => {
    const fn = vi.fn();
    const obj = { current: null as string | null };

    mergeRefs<string>(fn, obj, undefined)("node");

    expect(fn).toHaveBeenCalledWith("node");
    expect(obj.current).toBe("node");
  });

  it("resets refs to null on cleanup", () => {
    const fn = vi.fn();
    const obj = { current: null as string | null };

    const cleanup = mergeRefs<string>(fn, obj)("node");
    (cleanup as () => void)();

    expect(fn).toHaveBeenLastCalledWith(null);
    expect(obj.current).toBeNull();
  });

  it("uses the cleanup returned by a callback ref instead of null", () => {
    const inner = vi.fn();
    const fn = vi.fn(() => inner);

    const cleanup = mergeRefs<string>(fn)("node");
    (cleanup as () => void)();

    expect(inner).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
