"use client";

import type { GroupSummary } from "@pt/contracts";
import clsx from "clsx";
import { BellOff, Plus } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { Avatar } from "@/components/common/Avatar";
import { ROUTES } from "@/constants/routes";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import { formatInboxTime } from "@/features/chat/utils/chat-inbox";
import { previewKindOf } from "@/features/chat-groups/utils/group-display";
import { getAdminGroupPath, getUserGroupPath } from "@/utils/routes";

interface GroupInboxSectionProps {
  groups: GroupSummary[];
  // Admins get the create link and their own routes; trainees only read.
  role?: "admin" | "user";
  // "admin:<id>" | "user:<id>" of the viewer: "You: " prefix on their own
  // last message.
  viewerKey: string;
  nowMs: number;
  // No groups at all (not a filter or search that hid them): say so.
  showEmptyHint: boolean;
}

const MAX_SHOWN = 99;

// The "Nhóm" section of the admin and trainee inbox: one row per group (photo
// or initials, name, last message, time, unread, muted) and, for admins, the
// create link.
export const GroupInboxSection = ({
  groups,
  role = "admin",
  viewerKey,
  nowMs,
  showEmptyHint,
}: GroupInboxSectionProps) => {
  const locale = useLocale();
  const t = useTranslations("chatGroups");

  return (
    <section className="space-y-2" aria-label={t("inbox.listLabel")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className={SECTION_TITLE}>{t("inbox.title")}</h2>
        {role === "admin" && (
          <Link
            href={ROUTES.ADMIN_GROUP_NEW}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent transition active:bg-line"
          >
            <Plus className="size-4" aria-hidden />
            {t("inbox.create")}
          </Link>
        )}
      </div>
      {groups.length === 0 ? (
        showEmptyHint && (
          <p className="px-1 pb-1 text-sm text-muted">{t("inbox.empty")}</p>
        )
      ) : (
        <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
          {groups.map((group) => {
            const isUnread = group.unread > 0;
            const last = group.lastMessage;
            const kind = previewKindOf(last);
            const preview =
              kind === "text"
                ? `${last?.senderKey === viewerKey ? t("inbox.you") : ""}${last?.preview ?? ""}`
                : kind === "photo"
                  ? (last?.photoCount ?? 0) > 1
                    ? t("inbox.photos", { count: last?.photoCount ?? 0 })
                    : t("inbox.photo")
                  : kind === "sticker"
                    ? t("inbox.sticker")
                    : kind === "system"
                      ? t("systemLine.unknown")
                      : kind === "unsent"
                        ? t("inbox.unsent")
                        : t("inbox.noMessages");
            const time = formatInboxTime(
              group.lastMessageAt ? Date.parse(group.lastMessageAt) : null,
              nowMs,
              locale,
            );

            return (
              <li key={group.id}>
                <Link
                  href={(role === "admin"
                    ? getAdminGroupPath
                    : getUserGroupPath)(group.id)}
                  className="flex min-h-16 min-w-0 items-center gap-3 px-4 py-3 transition active:bg-line"
                >
                  <Avatar
                    name={group.name}
                    src={group.avatarUrl}
                    tone="soft"
                    className="size-11 text-sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span
                        className={clsx(
                          "flex min-w-0 items-center gap-1.5 text-fg",
                          isUnread ? "font-bold" : "font-semibold",
                        )}
                      >
                        <span className="truncate">{group.name}</span>
                        {group.muted && (
                          <BellOff
                            className="size-3.5 shrink-0 text-muted"
                            aria-label={t("inbox.muted")}
                          />
                        )}
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 text-xs",
                          isUnread ? "font-semibold text-accent" : "text-muted",
                        )}
                      >
                        {time}
                      </span>
                    </span>
                    <span className="mt-0.5 flex items-center justify-between gap-2">
                      <span
                        className={clsx(
                          "truncate text-sm",
                          isUnread ? "font-semibold text-fg" : "text-muted",
                        )}
                      >
                        {preview}
                      </span>
                      {isUnread && (
                        <span
                          role="status"
                          aria-label={t("inbox.unreadLabel", {
                            count: group.unread,
                          })}
                          className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] leading-none font-bold text-accent-fg"
                        >
                          {group.unread > MAX_SHOWN
                            ? `${MAX_SHOWN}+`
                            : group.unread}
                        </span>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
