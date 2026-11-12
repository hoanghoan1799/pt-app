"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  loadPopSetting,
  savePopSetting,
  subscribePopSetting,
} from "@/features/chat-bubbles/utils/pop-setting";

// [enabled, setEnabled] for "show a chat bubble on new messages" (this device).
export const useBubblePopSetting = (): [
  boolean,
  (enabled: boolean) => void,
] => {
  const enabled = useSyncExternalStore(
    subscribePopSetting,
    loadPopSetting,
    () => true,
  );
  const setEnabled = useCallback((next: boolean) => savePopSetting(next), []);

  return [enabled, setEnabled];
};
