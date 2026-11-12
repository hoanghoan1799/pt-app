// Domain events of the admin accounts.
export const ADMIN_EVENTS = {
  // The "activity status" switch changed: the PT team's online state may too.
  presenceHiddenChanged: "admin.presence_hidden.changed",
} as const;

export type AdminPresenceHiddenChangedEvent = {
  adminId: number;
  presenceHidden: boolean;
};
