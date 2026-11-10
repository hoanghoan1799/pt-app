import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Avatar } from "@/components/common/Avatar";
import { Spinner } from "@/components/common/Spinner";
import { CARD } from "@/constants/styles";
import { getAdminUserPath } from "@/utils/routes";

interface HiddenUserListProps {
  users: {
    userId: number;
    userName: string;
    // The viewing admin's private nickname if they set one; else userName.
    displayName?: string;
    avatarUrl: string | null;
  }[];
  onUnhide: (userId: number) => void;
  isBusy?: boolean;
}

// Hidden trainees revealed with the passcode (R3): name links to their page,
// "Bỏ ẩn" makes them visible again for good.
export const HiddenUserList = ({
  users,
  onUnhide,
  isBusy = false,
}: HiddenUserListProps) => {
  const t = useTranslations("chat.hiddenUserList");
  // The row whose unhide is running (shows the spinner).
  const [tappedId, setTappedId] = useState<number | null>(null);

  return (
    <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
      {users.map((user) => (
        <li key={user.userId} className="flex items-center">
          <Link
            href={getAdminUserPath(user.userId)}
            className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 font-semibold text-fg transition active:bg-line"
          >
            <Avatar
              name={user.displayName ?? user.userName}
              src={user.avatarUrl}
              tone="soft"
              className="size-10 text-sm"
            />
            <span className="truncate">
              {user.displayName ?? user.userName}
            </span>
          </Link>
          <button
            type="button"
            disabled={isBusy}
            aria-busy={isBusy && tappedId === user.userId}
            onClick={() => {
              setTappedId(user.userId);
              onUnhide(user.userId);
            }}
            className="mr-3 inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold text-fg transition active:bg-line disabled:opacity-50"
          >
            {isBusy && tappedId === user.userId && <Spinner size="sm" />}
            {t("unhide")}
          </button>
        </li>
      ))}
    </ul>
  );
};
