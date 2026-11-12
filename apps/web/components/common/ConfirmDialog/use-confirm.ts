import { useSyncExternalStore } from "react";

export interface ConfirmOptions {
  title: string;
  description?: string;
  // Label of the action button; already translated by the caller, e.g. t("delete").
  confirmLabel: string;
  cancelLabel?: string;
  // Destructive actions get the danger button.
  isDanger?: boolean;
}

export interface ConfirmState {
  isOpen: boolean;
  // Kept after closing so the content doesn't flash during the exit animation.
  options: ConfirmOptions | null;
  // Counts the requests, so a dialog reopened during its exit animation (the
  // sheet never remounts) can still be told apart from the one before.
  requestId: number;
}

const CLOSED: ConfirmState = { isOpen: false, options: null, requestId: 0 };

// One dialog at a time: asking again while one is open cancels the first.
export const createConfirmStore = () => {
  let state: ConfirmState = CLOSED;
  let pending: ((isConfirmed: boolean) => void) | null = null;
  const listeners = new Set<() => void>();

  const setState = (next: ConfirmState) => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const settle = (isConfirmed: boolean) => {
    const resolve = pending;

    pending = null;
    resolve?.(isConfirmed);
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => state,
    request: (options: ConfirmOptions) => {
      settle(false);
      return new Promise<boolean>((resolve) => {
        pending = resolve;
        setState({ isOpen: true, options, requestId: state.requestId + 1 });
      });
    },
    // Esc, the scrim and "Hủy" all land here with false.
    resolve: (isConfirmed: boolean) => {
      settle(isConfirmed);
      if (state.isOpen) {
        setState({ ...state, isOpen: false });
      }
    },
  };
};

export const confirmStore = createConfirmStore();

const requestConfirm = (options: ConfirmOptions) =>
  confirmStore.request(options);

// `await confirm({ ... })` resolves true on the action button, false otherwise.
export const useConfirm = () => requestConfirm;

export const useConfirmState = () =>
  useSyncExternalStore(
    confirmStore.subscribe,
    confirmStore.getSnapshot,
    () => CLOSED,
  );
