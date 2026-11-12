import type { PtFilter } from "@/features/dashboard/types/dashboard";

export const PT_FILTER_PARAM = "pt";

// `?pt=` -> filter: "none" = trainees without a PT, a positive integer = that
// PT, anything else (missing, garbage) = everyone.
export const parsePtFilter = (raw: string | undefined): PtFilter => {
  if (raw === "none") {
    return "none";
  }

  const id = Number(raw);

  return raw !== undefined && Number.isInteger(id) && id > 0 ? id : "all";
};
