"use client";

import clsx from "clsx";
import { ChevronRight, Search, Users, Utensils } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { Input } from "@/components/common/Input";
import { ProgressBar } from "@/components/common/ProgressBar";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import { HiddenUserList } from "@/features/chat/components/HiddenUserList";
import { UnreadBadge } from "@/features/chat/components/UnreadBadge";
import { useHiddenReveal } from "@/features/chat/hooks/use-hidden-reveal";
import { unhideUserAction } from "@/features/chat/services/chat-hidden-actions";
import { useMemberSearch } from "@/features/dashboard/hooks/use-member-search";
import type { MemberRow } from "@/features/dashboard/types/dashboard";
import { RestrictionBadge } from "@/features/restrictions/components/RestrictionBadge";

interface MemberProgressListProps {
  members: MemberRow[];
  hasPasscode: boolean;
  // Show each trainee's PT (super admin view).
  isPtShown?: boolean;
}

export const MemberProgressList = ({
  members,
  hasPasscode,
  isPtShown = false,
}: MemberProgressListProps) => {
  const t = useTranslations("dashboard.memberList");
  const router = useRouter();

  const getStatusText = (member: MemberRow) => {
    if (member.status === "no-plan") {
      return t("noPlan");
    }
    return t("statusLine", {
      completed: member.completed,
      assigned: member.assigned,
      activeDays: member.activeDays,
      plannedDays: member.plannedDays,
    });
  };
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
        toast.error(t("unhideFailed"));
      } catch {
        toast.error(t("unhideFailed"));
      }
    });
  };

  return (
    <div className="space-y-3">
      <Input
        type="search"
        clearable
        leadingIcon={<Search className="size-5" aria-hidden />}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        autoComplete="off"
        enterKeyHint="search"
      />
      {hiddenUsers.length > 0 ? (
        <section className="space-y-2" aria-label={t("hiddenTitle")}>
          <h2 className={SECTION_TITLE}>{t("hiddenTitle")}</h2>
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
          <p className="mt-3 font-semibold text-fg">{t("emptyTitle")}</p>
          <p className="mt-1 text-sm text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredMembers.map((member) => (
            <li key={member.id} className={`${CARD} overflow-hidden`}>
              <Link
                href={member.href}
                className="flex items-center gap-3 px-4 py-3.5 transition active:bg-line/60"
              >
                <Avatar
                  name={member.displayName}
                  src={member.avatarUrl}
                  tone="soft"
                  className={clsx(
                    "size-10 text-base",
                    member.status === "done" && "bg-success/15 text-success",
                  )}
                />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-semibold text-fg">
                        {member.displayName}
                      </span>
                      <UnreadBadge count={member.unread} className="shrink-0" />
                      {member.restrictionLevel && (
                        <RestrictionBadge level={member.restrictionLevel} />
                      )}
                      {isPtShown && (
                        <span className="shrink-0 rounded-full bg-line/60 px-2 py-0.5 text-xs font-medium text-muted">
                          {member.ptName
                            ? t("ptBadge", { name: member.ptName })
                            : t("noPt")}
                        </span>
                      )}
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
                      label={t("progressLabel", { name: member.displayName })}
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
                        title={t("nutritionTitle")}
                      >
                        <Utensils className="size-3" aria-hidden />
                        <span className="sr-only">{t("nutritionLabel")}</span>
                        {member.nutritionDays}/7
                      </span>
                      {member.lastActiveLabel
                        ? t("lastActive", { when: member.lastActiveLabel })
                        : t("notTrained")}
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
              {t("noMatch", { query })}
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
