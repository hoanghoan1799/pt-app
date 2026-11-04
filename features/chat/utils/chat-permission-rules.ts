// Chat is off by default: only an explicit `true` unlocks it (null = never
// enabled, false = locked again by the admin).
export const isChatEnabled = (user: { chatEnabled: boolean | null }) =>
  user.chatEnabled === true;
