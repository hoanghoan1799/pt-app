export type SetAliasResult =
  | { status: "success"; targetKey: string; alias: string }
  | { status: "error"; message: string };
