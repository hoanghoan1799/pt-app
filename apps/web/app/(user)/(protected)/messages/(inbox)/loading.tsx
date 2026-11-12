import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Avatar } from "@/components/common/Avatar";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { SkeletonList } from "@/components/common/Skeleton";
import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD } from "@/constants/styles";

const ROW = `${CARD} flex items-center gap-3 p-3 active:bg-line/60`;

export default async function Loading() {
  const t = await getTranslations("chat.pages");
  const dm = await getTranslations("social.dm");

  return (
    <PageSkeleton header={<AppHeader title={dm("inboxTitle")} />}>
      {/* The coach row is always there; only its unread dot is data. */}
      <ul>
        <li>
          <Link href={ROUTES.MESSAGES_COACH} className={ROW}>
            <Avatar name="PT" className="size-12 shrink-0 text-base" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-fg">
                {dm("coachTitle")}
              </span>
              <span className="block truncate text-sm text-muted">
                {t("coachSubtitle")}
              </span>
            </span>
          </Link>
        </li>
      </ul>
      <SkeletonList rows={3} />
    </PageSkeleton>
  );
}
