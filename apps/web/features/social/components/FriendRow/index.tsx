import Link from "next/link";
import type { ReactNode } from "react";

import { Avatar } from "@/components/common/Avatar";
import { CARD } from "@/constants/styles";
import type { PersonView } from "@/features/social/types/social";
import { profilePath } from "@/features/social/utils/post-rules";

interface FriendRowProps {
  person: PersonView;
  // Blocked people have no profile to open.
  isLinked?: boolean;
  children?: ReactNode;
}

// One person in the friends lists: avatar and name, plus the row's actions.
export const FriendRow = ({
  person,
  isLinked = true,
  children,
}: FriendRowProps) => {
  const identity = (
    <>
      <Avatar
        name={person.name}
        src={person.avatarUrl}
        className="size-11 shrink-0 text-sm"
      />
      <span className="min-w-0 flex-1 truncate font-semibold text-fg">
        {person.name}
      </span>
    </>
  );

  return (
    <li className={`${CARD} flex flex-wrap items-center gap-3 p-3`}>
      {isLinked ? (
        <Link
          href={profilePath("user", person.id)}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {identity}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
      )}
      {children}
    </li>
  );
};
