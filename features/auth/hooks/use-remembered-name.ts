"use client";

import { useSyncExternalStore } from "react";

import { readRememberedName } from "@/features/auth/utils/remembered-name";

const subscribe = () => () => {};

// Empty on the server, the stored name after hydration.
export const useRememberedName = () =>
  useSyncExternalStore(subscribe, readRememberedName, () => "");
