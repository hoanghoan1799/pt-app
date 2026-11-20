// The routes a group thread talks to. Admin views pass `?as=admin`, because a
// browser can hold both an admin and a trainee cookie and the routes serve the
// trainee unless asked.

export type GroupApiRole = "user" | "admin";

const query = (role: GroupApiRole) => (role === "admin" ? "?as=admin" : "");

export const groupRoutes = (groupId: number, role: GroupApiRole) => {
  const base = `/api/chat/groups/${groupId}`;
  const suffix = query(role);

  return {
    messages: `${base}/messages${suffix}`,
    edits: (messageId: number) =>
      `${base}/messages/${messageId}/edits${suffix}`,
    seenBy: (messageId: number) =>
      `${base}/messages/${messageId}/seen${suffix}`,
    photos: `${base}/photos${suffix}`,
  };
};
