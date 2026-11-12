import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
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
  getSocialMe,
  listBlockedByMe,
  listFriendRequests,
  listFriends,
} from "@/features/social/services/social-queries";
import { requireUser } from "@/services/auth-guard";
import { readSearchParam } from "@/utils/search-params";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("friendsTitle") };
};

const EMPTY = `${CARD} p-6 text-center text-muted`;

const FriendsPage = async ({ searchParams }: PageProps<"/friends">) => {
  const t = await getTranslations("social.pages");
  await requireUser();

  // Social pages sit behind the terms; the feed shows them.
  if (!(await getSocialMe("user")).termsAccepted) {
    redirect(ROUTES.FEED);
  }
  const tab = parseFriendsTab(readSearchParam((await searchParams).tab));
  const [friends, requests, blocked] = await Promise.all([
    tab === "friends" ? listFriends() : [],
    listFriendRequests(),
    tab === "friends" ? listBlockedByMe() : [],
  ]);

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("friendsTitle")}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <FriendsTabs active={tab} requestCount={requests.received.length} />
        {tab === "friends" && (
          <>
            <section className="space-y-2" aria-label={t("friendsAria")}>
              <h2 className={SECTION_TITLE}>
                {t("friendsCount", { count: friends.length })}
              </h2>
              {friends.length === 0 ? (
                <p className={EMPTY}>{t("friendsEmpty")}</p>
              ) : (
                <ul className="space-y-2">
                  {friends.map((person) => (
                    <FriendRow key={person.id} person={person} />
                  ))}
                </ul>
              )}
            </section>
            {blocked.length > 0 && (
              <section className="space-y-2" aria-label={t("blockedAria")}>
                <h2 className={SECTION_TITLE}>
                  {t("blockedCount", { count: blocked.length })}
                </h2>
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
            <section className="space-y-2" aria-label={t("receivedAria")}>
              <h2 className={SECTION_TITLE}>
                {t("receivedCount", { count: requests.received.length })}
              </h2>
              {requests.received.length === 0 ? (
                <p className={EMPTY}>{t("noRequests")}</p>
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
            <section className="space-y-2" aria-label={t("sentAria")}>
              <h2 className={SECTION_TITLE}>
                {t("sentCount", { count: requests.sent.length })}
              </h2>
              {requests.sent.length === 0 ? (
                <p className={EMPTY}>{t("noSent")}</p>
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
      <ScrollToTopButton aboveTabBar />
    </>
  );
};

export default FriendsPage;
