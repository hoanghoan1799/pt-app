import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { NotificationList } from "@/features/social/components/NotificationList";
import {
  listNotifications,
  markAllNotificationsRead,
  purgeOldNotifications,
} from "@/features/social/services/social-notifications";
import { hasAcceptedTerms } from "@/features/social/services/terms";
import { requireUser } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.pages");

  return { title: t("notificationsTitle") };
};

const NotificationsPage = async () => {
  const t = await getTranslations("social.pages");
  const user = await requireUser();

  if (!hasAcceptedTerms(user)) {
    redirect(ROUTES.FEED);
  }
  const key = `user:${user.id}`;

  await purgeOldNotifications();
  // Listed first, so the page still shows which ones were new.
  const notifications = await listNotifications(key);

  await markAllNotificationsRead(key);
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
    </>
  );
};

export default NotificationsPage;
