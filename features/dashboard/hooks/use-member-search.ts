"use client";

import { useState } from "react";

import type { MemberRow } from "@/features/dashboard/types/dashboard";
import { toNameKey } from "@/utils/name";

export const useMemberSearch = (members: MemberRow[]) => {
  const [query, setQuery] = useState("");
  const queryKey = toNameKey(query);
  const filteredMembers = queryKey
    ? members.filter((member) => toNameKey(member.name).includes(queryKey))
    : members;

  return { query, setQuery, filteredMembers };
};
