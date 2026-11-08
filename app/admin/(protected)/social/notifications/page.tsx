import type { Metadata } from "next";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { PAGE_CONTAINER } from "@/constants/styles";
import { NotificationList } from "@/features/social/components/NotificationList";
import {
  listNotifications,
  markAllNotificationsRead,
  purgeOldNotifications,
} from "@/features/social/services/social-notifications";
import { requireAdmin } from "@/services/auth-guard";

export const metadata: Metadata = { title: "Thông báo" };

const AdminNotificationsPage = async () => {
  const admin = await requireAdmin();
  const key = `admin:${admin.id}`;

  await purgeOldNotifications();
  const notifications = await listNotifications(key);

  await markAllNotificationsRead(key);
  return (
    <>
      <AppHeader
        eyebrow="Mạng xã hội"
        title="Thông báo"
        backHref={ROUTES.ADMIN_SOCIAL}
      />
      <main
        className={`${PAGE_CONTAINER} pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <NotificationList notifications={notifications} />
      </main>
    </>
  );
};

export default AdminNotificationsPage;
