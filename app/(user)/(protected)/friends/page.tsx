import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { FriendRequestActions } from "@/features/social/components/FriendRequestActions";
import { FriendRow } from "@/features/social/components/FriendRow";
import { FriendSearch } from "@/features/social/components/FriendSearch";
import {
  FriendsTabs,
  parseFriendsTab,
} from "@/features/social/components/FriendsTabs";
import { UnblockButton } from "@/features/social/components/UnblockButton";
import {
  listBlockedByMe,
  listFriendRequests,
  listFriends,
} from "@/features/social/services/friend-queries";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const metadata: Metadata = { title: "Bạn bè" };

const EMPTY = `${CARD} p-6 text-center text-muted`;

const FriendsPage = async ({ searchParams }: PageProps<"/friends">) => {
  const user = await requireUser();

  // Social pages sit behind the terms; the feed shows them.
  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const tab = parseFriendsTab(readSearchParam((await searchParams).tab));
  const [friends, requests, blocked] = await Promise.all([
    tab === "friends" ? listFriends(user.id) : [],
    listFriendRequests(user.id),
    tab === "friends" ? listBlockedByMe(user.id) : [],
  ]);

  return (
    <>
      <AppHeader eyebrow="Mạng xã hội" title="Bạn bè" backHref={ROUTES.FEED} />
      <main
        className={`${PAGE_CONTAINER} space-y-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <FriendsTabs active={tab} requestCount={requests.received.length} />
        {tab === "friends" && (
          <>
            <section className="space-y-2" aria-label="Bạn bè">
              <h2 className={SECTION_TITLE}>Bạn bè · {friends.length}</h2>
              {friends.length === 0 ? (
                <p className={EMPTY}>
                  Chưa có bạn bè nào. Hãy tìm bạn bằng email.
                </p>
              ) : (
                <ul className="space-y-2">
                  {friends.map((person) => (
                    <FriendRow key={person.id} person={person} />
                  ))}
                </ul>
              )}
            </section>
            {blocked.length > 0 && (
              <section className="space-y-2" aria-label="Đã chặn">
                <h2 className={SECTION_TITLE}>Đã chặn · {blocked.length}</h2>
                <ul className="space-y-2">
                  {blocked.map((person) => (
                    <FriendRow key={person.id} person={person} isLinked={false}>
                      <UnblockButton userId={person.id} />
                    </FriendRow>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {tab === "requests" && (
          <>
            <section className="space-y-2" aria-label="Lời mời đã nhận">
              <h2 className={SECTION_TITLE}>
                Đã nhận · {requests.received.length}
              </h2>
              {requests.received.length === 0 ? (
                <p className={EMPTY}>Không có lời mời nào.</p>
              ) : (
                <ul className="space-y-2">
                  {requests.received.map((person) => (
                    <FriendRow key={person.id} person={person}>
                      <FriendRequestActions
                        userId={person.id}
                        direction="received"
                      />
                    </FriendRow>
                  ))}
                </ul>
              )}
            </section>
            <section className="space-y-2" aria-label="Lời mời đã gửi">
              <h2 className={SECTION_TITLE}>Đã gửi · {requests.sent.length}</h2>
              {requests.sent.length === 0 ? (
                <p className={EMPTY}>Bạn chưa gửi lời mời nào.</p>
              ) : (
                <ul className="space-y-2">
                  {requests.sent.map((person) => (
                    <FriendRow key={person.id} person={person}>
                      <FriendRequestActions
                        userId={person.id}
                        direction="sent"
                      />
                    </FriendRow>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {tab === "search" && <FriendSearch />}
      </main>
    </>
  );
};

export default FriendsPage;
