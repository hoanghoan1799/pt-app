"use client";

import { useCallback, useSyncExternalStore } from "react";

import {
  loadSuggestSetting,
  saveSuggestSetting,
  subscribeSuggestSettings,
  type SuggestSetting,
} from "@/features/chat/utils/sticker-suggest-settings";

const getServerSnapshot = () => true;

// [enabled, setEnabled] for one of the per-device suggestion switches. The
// composer and the sticker panel share it, so a change shows up at once.
export const useStickerSuggestSetting = (
  setting: SuggestSetting,
): [boolean, (enabled: boolean) => void] => {
  const getSnapshot = useCallback(() => loadSuggestSetting(setting), [setting]);
  const enabled = useSyncExternalStore(
    subscribeSuggestSettings,
    getSnapshot,
    getServerSnapshot,
  );
  const setEnabled = useCallback(
    (next: boolean) => saveSuggestSetting(setting, next),
    [setting],
  );

  return [enabled, setEnabled];
};
