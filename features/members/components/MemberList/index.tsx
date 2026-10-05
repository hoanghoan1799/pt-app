"use client";

import { ChevronRight, Search, Users } from "lucide-react";
import Link from "next/link";

import { CARD, INPUT } from "@/constants/styles";
import { useMemberSearch } from "@/features/members/hooks/use-member-search";
import type { Member } from "@/features/members/types/member";
import { getInitial } from "@/utils/name";
import { getAdminUserPath } from "@/utils/routes";

// Search only pays off once the list no longer fits on a phone screen.
const SEARCH_THRESHOLD = 6;

interface MemberListProps {
  members: Member[];
}

export const MemberList = ({ members }: MemberListProps) => {
  const { query, setQuery, filteredMembers } = useMemberSearch(members);

  if (!members.length) {
    return (
      <div
        className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}
      >
        <Users className="size-10 text-muted" aria-hidden />
        <p className="mt-3 font-semibold text-fg">Chưa có user nào</p>
        <p className="mt-1 text-sm text-muted">
          Thêm user ở trên, sau đó họ chỉ cần nhập đúng tên để vào xem bài tập.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.length > SEARCH_THRESHOLD && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm user"
            aria-label="Tìm user"
            className={`${INPUT} pl-11`}
          />
        </div>
      )}
      <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
        {filteredMembers.map((member) => (
          <li key={member.id}>
            <Link
              href={getAdminUserPath(member.id)}
              className="flex min-h-16 items-center gap-3 px-4 py-3 transition active:bg-line/60"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 font-bold text-accent">
                {getInitial(member.name)}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-fg">
                {member.name}
              </span>
              <ChevronRight
                className="size-5 shrink-0 text-muted"
                aria-hidden
              />
            </Link>
          </li>
        ))}
        {!filteredMembers.length && (
          <li className="px-4 py-6 text-center text-sm text-muted">
            Không có user nào khớp “{query}”
          </li>
        )}
      </ul>
    </div>
  );
};
