export const RESTRICTION_EVENTS = {
  // A super admin suspended a trainee: realtime drops their sockets.
  suspended: "restriction.suspended",
} as const;

export type TraineeSuspendedEvent = { userId: number };
