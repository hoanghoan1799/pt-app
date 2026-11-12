import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { ScrollToTopButton } from "@/components/common/ScrollToTopButton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { NotificationList } from "@/features/social/components/NotificationList";
import {
  listNotifications,
  markNotificationsRead,
} from "@/features/social/services/social-queries";
import { requireAdmin } from "@/services/auth-guard";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("social.adminPages");

  return { title: t("notificationsTitle") };
};

const AdminNotificationsPage = async () => {
  const t = await getTranslations("social.adminPages");
  await requireAdmin();
  // Listed first, so the page still shows which ones were new.
  const { notifications, unreadCount } = await listNotifications(
    "admin",
    await getLocale(),
  );

  if (unreadCount > 0) {
    await markNotificationsRead("admin");
  }
  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("notificationsTitle")}
        backHref={ROUTES.ADMIN_SOCIAL}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <NotificationList notifications={notifications} />
      </main>
      <ScrollToTopButton />
    </>
  );
};

export default AdminNotificationsPage;
