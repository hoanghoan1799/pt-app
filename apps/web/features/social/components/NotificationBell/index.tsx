import { Bell } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface NotificationBellProps {
  href: string;
  unreadCount: number;
}

// Header bell with the unread count (server-rendered; actions revalidate it).
export const NotificationBell = ({
  href,
  unreadCount,
}: NotificationBellProps) => {
  const t = useTranslations("social.notifications");

  return (
    <Link
      href={href}
      aria-label={
        unreadCount > 0 ? t("bellUnread", { count: unreadCount }) : t("bell")
      }
      className="relative inline-flex size-11 items-center justify-center"
    >
      <Bell className="size-6" aria-hidden />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-xs leading-5 font-bold text-white">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
};
