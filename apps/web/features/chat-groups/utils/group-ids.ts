import { z } from "zod";

// Ids taken from a URL segment (group, message, photo): a positive integer
// the database can hold, else null. The API checks membership again.
const MAX_ID = 2_147_483_647;

const idSchema = z.coerce.number().int().positive().max(MAX_ID);

export const parseRouteId = (value: unknown): number | null => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = idSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
};
