import Link from "next/link";

import { Avatar } from "@/components/common/Avatar";
import { CARD } from "@/constants/styles";
import { getAdminUserPath } from "@/utils/routes";

interface HiddenUserListProps {
  users: { userId: number; userName: string; avatarUrl: string | null }[];
  onUnhide: (userId: number) => void;
  isBusy?: boolean;
}

// Hidden trainees revealed with the passcode (R3): name links to their page,
// "Bỏ ẩn" makes them visible again for good.
export const HiddenUserList = ({
  users,
  onUnhide,
  isBusy = false,
}: HiddenUserListProps) => (
  <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
    {users.map((user) => (
      <li key={user.userId} className="flex items-center">
        <Link
          href={getAdminUserPath(user.userId)}
          className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-4 py-3 font-semibold text-fg transition active:bg-line"
        >
          <Avatar
            name={user.userName}
            src={user.avatarUrl}
            tone="soft"
            className="size-10 text-sm"
          />
          <span className="truncate">{user.userName}</span>
        </Link>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUnhide(user.userId)}
          className="mr-3 inline-flex min-h-11 shrink-0 items-center rounded-lg border border-line px-3 text-sm font-semibold text-fg transition active:bg-line disabled:opacity-50"
        >
          Bỏ ẩn
        </button>
      </li>
    ))}
  </ul>
);
