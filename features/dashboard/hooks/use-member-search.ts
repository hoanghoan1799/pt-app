"use client";

import { useState } from "react";

import { matchesInboxSearch } from "@/features/chat/utils/inbox-search";
import type { MemberRow } from "@/features/dashboard/types/dashboard";

// Case- and diacritics-insensitive name filter ("Tìm học viên").
export const useMemberSearch = (members: MemberRow[]) => {
  const [query, setQuery] = useState("");
  const filteredMembers = members.filter((member) =>
    matchesInboxSearch(query, member.name),
  );

  return { query, setQuery, filteredMembers };
};
