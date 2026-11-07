"use client";

import clsx from "clsx";
import { ChevronRight, Search, Users, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ProgressBar } from "@/components/common/ProgressBar";
import { CARD, INPUT, SECTION_TITLE } from "@/constants/styles";
import { HiddenUserList } from "@/features/chat/components/HiddenUserList";
import { UnreadBadge } from "@/features/chat/components/UnreadBadge";
import { useHiddenReveal } from "@/features/chat/hooks/use-hidden-reveal";
import { unhideUserAction } from "@/features/chat/services/chat-hidden-actions";
import { useMemberSearch } from "@/features/dashboard/hooks/use-member-search";
import type { MemberRow } from "@/features/dashboard/types/dashboard";
import { getInitial } from "@/utils/name";

interface MemberProgressListProps {
  members: MemberRow[];
  hasPasscode: boolean;
}

const UNHIDE_FAILED = "Không bỏ ẩn được. Thử lại nhé.";

const getStatusText = (member: MemberRow) => {
  if (member.status === "no-plan") {
    return "Chưa có lịch tuần này";
  }
  return `${member.completed}/${member.assigned} bài · ${member.activeDays}/${member.plannedDays} ngày`;
};

export const MemberProgressList = ({
  members,
  hasPasscode,
}: MemberProgressListProps) => {
  const router = useRouter();
  const { query, setQuery, filteredMembers } = useMemberSearch(members);
  const { revealed, remove } = useHiddenReveal(query, hasPasscode);
  const [isPending, startTransition] = useTransition();
  const hiddenUsers = revealed?.users ?? [];

  const unhide = (userId: number) => {
    startTransition(async () => {
      try {
        const result = await unhideUserAction(userId);

        if (result.status === "success") {
          remove(userId);
          router.refresh();
          return;
        }
        toast.error(UNHIDE_FAILED);
      } catch {
        toast.error(UNHIDE_FAILED);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm học viên"
          aria-label="Tìm học viên"
          autoComplete="off"
          enterKeyHint="search"
          className={`${INPUT} pl-11`}
        />
      </div>
      {hiddenUsers.length > 0 ? (
        <section className="space-y-2" aria-label="Học viên đã ẩn">
          <h2 className={SECTION_TITLE}>Học viên đã ẩn</h2>
          <HiddenUserList
            users={hiddenUsers}
            onUnhide={unhide}
            isBusy={isPending}
          />
        </section>
      ) : !members.length && query.trim() === "" ? (
        <div
          className={`${CARD} flex flex-col items-center px-6 py-10 text-center`}
        >
          <Users className="size-10 text-muted" aria-hidden />
          <p className="mt-3 font-semibold text-fg">Chưa có user nào</p>
          <p className="mt-1 text-sm text-muted">
            Chọn Thêm user ở mục Thao tác, sau đó họ chỉ cần nhập đúng tên để
            vào xem bài tập.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredMembers.map((member) => (
            <li key={member.id} className={`${CARD} overflow-hidden`}>
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
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-fg">
                        {member.name}
                      </span>
                      <UnreadBadge count={member.unread} className="shrink-0" />
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
                  <span className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 text-xs">
                    <span
                      className={clsx(
                        "min-w-0",
                        member.status === "no-plan"
                          ? "font-medium text-accent"
                          : "text-muted",
                      )}
                    >
                      {getStatusText(member)}
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-2 text-muted">
                      <span
                        className="inline-flex items-center gap-0.5"
                        title="Số ngày ghi nhật ký ăn tuần này"
                      >
                        <Utensils className="size-3" aria-hidden />
                        <span className="sr-only">Ghi nhật ký ăn</span>
                        {member.nutritionDays}/7
                      </span>
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
            <li className={`${CARD} px-4 py-6 text-center text-sm text-muted`}>
              Không có user nào khớp “{query}”
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
