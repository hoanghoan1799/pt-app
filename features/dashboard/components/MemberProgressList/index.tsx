"use client";

import clsx from "clsx";
import { ChevronRight, Search, Users } from "lucide-react";
import Link from "next/link";

import { ProgressBar } from "@/components/common/ProgressBar";
import { CARD, INPUT } from "@/constants/styles";
import { MEMBER_SEARCH_THRESHOLD } from "@/features/dashboard/constants/dashboard";
import { useMemberSearch } from "@/features/dashboard/hooks/use-member-search";
import type { MemberRow } from "@/features/dashboard/types/dashboard";
import { getInitial } from "@/utils/name";

interface MemberProgressListProps {
  members: MemberRow[];
}

const getStatusText = (member: MemberRow) => {
  if (member.status === "no-plan") {
    return "Chưa có lịch tuần này";
  }
  return `${member.completed}/${member.assigned} bài · ${member.activeDays}/${member.plannedDays} ngày`;
};

export const MemberProgressList = ({ members }: MemberProgressListProps) => {
  const { query, setQuery, filteredMembers } = useMemberSearch(members);

  if (!members.length) {
    return (
      <div
        className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}
      >
        <Users className="size-10 text-muted" aria-hidden />
        <p className="mt-3 font-semibold text-fg">Chưa có user nào</p>
        <p className="mt-1 text-sm text-muted">
          Bấm nút + ở góc trên để thêm user, sau đó họ chỉ cần nhập đúng tên để
          vào xem bài tập.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {members.length > MEMBER_SEARCH_THRESHOLD && (
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
              href={member.href}
              className="flex items-center gap-3 px-4 py-3.5 transition active:bg-line/60"
            >
              <span
                className={clsx(
                  "flex size-10 shrink-0 items-center justify-center rounded-full font-bold",
                  member.status === "done"
                    ? "bg-success/15 text-success"
                    : "bg-accent/15 text-accent",
                )}
              >
                {getInitial(member.name)}
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-semibold text-fg">
                    {member.name}
                  </span>
                  {member.status !== "no-plan" && (
                    <span
                      className={clsx(
                        "shrink-0 text-sm font-bold tabular-nums",
                        member.status === "done" ? "text-success" : "text-fg",
                      )}
                    >
                      {member.percent}%
                    </span>
                  )}
                </span>
                {member.status !== "no-plan" && (
                  <ProgressBar
                    percent={member.percent}
                    label={`Tiến độ của ${member.name}`}
                  />
                )}
                <span className="flex items-center justify-between gap-2 text-xs">
                  <span
                    className={clsx(
                      "truncate",
                      member.status === "no-plan"
                        ? "font-medium text-accent"
                        : "text-muted",
                    )}
                  >
                    {getStatusText(member)}
                  </span>
                  <span className="shrink-0 text-muted">
                    {member.lastActiveLabel
                      ? `Tập ${member.lastActiveLabel}`
                      : "Chưa tập"}
                  </span>
                </span>
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
