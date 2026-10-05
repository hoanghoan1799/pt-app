"use client";

import { useEffect } from "react";

import { saveRememberedName } from "@/features/auth/utils/remembered-name";

interface RememberUserProps {
  name: string;
}

// Stores the signed-in user's canonical name on the device; renders nothing.
export const RememberUser = ({ name }: RememberUserProps) => {
  useEffect(() => {
    saveRememberedName(name);
  }, [name]);

  return null;
};
