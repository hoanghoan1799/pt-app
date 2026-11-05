import { describe, expect, it, vi } from "vitest";

import {
  type ConfirmOptions,
  createConfirmStore,
} from "@/components/common/ConfirmDialog/use-confirm";

const OPTIONS: ConfirmOptions = {
  title: "Xóa bài tập này?",
  confirmLabel: "Xóa",
  isDanger: true,
};

describe("confirm store", () => {
  it("starts closed", () => {
    expect(createConfirmStore().getSnapshot()).toEqual({
      isOpen: false,
      options: null,
    });
  });

  it("opens with the options and resolves true on confirm", async () => {
    const store = createConfirmStore();
    const answer = store.request(OPTIONS);

    expect(store.getSnapshot()).toEqual({
      isOpen: true,
      options: OPTIONS,
      requestId: 1,
    });

    store.resolve(true);

    await expect(answer).resolves.toBe(true);
    expect(store.getSnapshot().isOpen).toBe(false);
  });

  it("resolves false on cancel, Esc and scrim (all call resolve(false))", async () => {
    const store = createConfirmStore();
    const answer = store.request(OPTIONS);

    store.resolve(false);

    await expect(answer).resolves.toBe(false);
  });

  it("keeps the options while closing so the content does not flash", () => {
    const store = createConfirmStore();

    void store.request(OPTIONS);
    store.resolve(false);

    expect(store.getSnapshot()).toEqual({
      isOpen: false,
      options: OPTIONS,
      requestId: 1,
    });
  });

  it("cancels the open dialog when another one is requested", async () => {
    const store = createConfirmStore();
    const first = store.request(OPTIONS);
    const second = store.request({ ...OPTIONS, title: "Xóa user này?" });

    await expect(first).resolves.toBe(false);
    expect(store.getSnapshot().options?.title).toBe("Xóa user này?");

    store.resolve(true);

    await expect(second).resolves.toBe(true);
  });

  it("ignores a second resolve and a resolve with nothing open", async () => {
    const store = createConfirmStore();
    const listener = vi.fn();

    store.resolve(true);
    expect(store.getSnapshot().isOpen).toBe(false);

    const answer = store.request(OPTIONS);

    store.subscribe(listener);
    store.resolve(true);
    store.resolve(false);

    await expect(answer).resolves.toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createConfirmStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    void store.request(OPTIONS);

    expect(listener).not.toHaveBeenCalled();
  });
});
