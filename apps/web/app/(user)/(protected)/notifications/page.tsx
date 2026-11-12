import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { NotificationList } from "@/features/social/components/NotificationList";
import {
  getSocialMe,
  listNotifications,
  markNotificationsRead,
} from "@/features/social/services/social-queries";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("notificationsTitle") };
};

const NotificationsPage = async () => {
  const t = await getTranslations("social.pages");
  await requireUser();

  if (!(await getSocialMe("user")).termsAccepted) {
    redirect(ROUTES.FEED);
  }
  // Listed first, so the page still shows which ones were new; the API no
  // longer marks them read by itself.
  const { notifications, unreadCount } = await listNotifications(
    "user",
    await getLocale(),
  );

  if (unreadCount > 0) {
    await markNotificationsRead("user");
  }
  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("notificationsTitle")}
        backHref={ROUTES.FEED}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+6rem)]`}
      >
        <NotificationList notifications={notifications} />
      </main>
      <ScrollToTopButton aboveTabBar />
    </>
  );
};

export default NotificationsPage;
