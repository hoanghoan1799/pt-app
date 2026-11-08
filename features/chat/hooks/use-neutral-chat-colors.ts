"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  loadNeutralColors,
  saveNeutralColors,
  subscribeNeutralColors,
} from "@/features/chat/utils/neutral-colors";

const noopSubscribe = () => () => {};
const getServerSnapshot = () => false;

// [enabled, setEnabled] for the admin's "neutral colours" switch. The server
// snapshot is false so hydration matches. Pass `active = false` (trainee
// views) to never touch storage and always get false.
export const useNeutralChatColors = (
  active = true,
): [boolean, (enabled: boolean) => void] => {
  const enabled = useSyncExternalStore(
    active ? subscribeNeutralColors : noopSubscribe,
    active ? loadNeutralColors : getServerSnapshot,
    getServerSnapshot,
  );
  const setEnabled = useCallback((next: boolean) => {
    saveNeutralColors(next);
  }, []);

  return [enabled, setEnabled];
};
