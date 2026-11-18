// A message an admin hid reads as an unsent one everywhere (no body, sticker,
// photo, reactions or quote; out of search, gallery and the inbox preview, no
// react / edit / unsend). The readers select `deletedAt` through this, so the
// mapper and the guards need no second flag; the row keeps its own deleted_at
// (null) and its hidden_by_admin_id as evidence for the report.
export const goneAtSql = (alias = "") => {
  const column = (name: string) => (alias === "" ? name : `${alias}.${name}`);

  return `COALESCE(${column("deleted_at")}, CASE WHEN ${column("hidden_by_admin_id")} IS NOT NULL THEN ${column("created_at")} END)`;
};

// For a WHERE clause of a reader that lists live messages only.
export const liveMessageSql = (alias: string) =>
  `${alias}.deleted_at IS NULL AND ${alias}.hidden_by_admin_id IS NULL`;
