"use client";

import { usePresenceHeartbeat } from "@/features/chat/hooks/use-presence-heartbeat";

// Renders nothing; mounted once per protected layout so any page counts as
// "online".
export const PresenceHeartbeat = ({ role }: { role: "user" | "admin" }) => {
  usePresenceHeartbeat(role);

  return null;
};
