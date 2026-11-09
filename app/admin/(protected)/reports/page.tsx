import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { ReportActions } from "@/features/social/components/ReportActions";
import { listOpenReports } from "@/features/social/services/report-queries";
import { requireSuperAdmin } from "@/services/auth-guard";
import { formatRelativeTime } from "@/utils/time";

export const generateMetadata = async (): Promise<Metadata> => {
  const t = await getTranslations("adminPages.reports");

  return { title: t("metaTitle") };
};

// Super admin only (spec M1, A14): open reports with a preview of the target.
const AdminReportsPage = async () => {
  await requireSuperAdmin();
  const t = await getTranslations("adminPages.reports");
  const locale = await getLocale();

  const reports = await listOpenReports();

  return (
    <>
      <AppHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        backHref={ROUTES.ADMIN}
      />
      <main
        className={`${PAGE_CONTAINER} space-y-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <h2 className={SECTION_TITLE}>
          {t("pending", { count: reports.length })}
        </h2>
        {reports.length === 0 ? (
          <p className={`${CARD} p-6 text-center text-muted`}>
            {t("emptyList")}
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className={`${CARD} space-y-3 p-4`}>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-fg">
                    {t(`kinds.${report.targetKind}`)}
                  </span>
                  {report.targetName &&
                    t("targetName", { name: report.targetName })}
                  {" · "}
                  {formatRelativeTime(
                    report.createdAt,
                    TIME_ZONE,
                    undefined,
                    locale,
                  )}
                </p>
                {report.preview !== null ? (
                  <p className="text-base break-words whitespace-pre-wrap text-fg">
                    {report.preview || t("emptyPreview")}
                  </p>
                ) : report.targetKind !== "user" ? (
                  <p className="text-base text-muted italic">{t("deleted")}</p>
                ) : null}
                {report.href && (
                  <Link
                    href={report.href}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
                  >
                    {report.targetKind === "user"
                      ? t("viewProfile")
                      : t("view")}
                  </Link>
                )}
                <p className="text-sm break-words text-muted">
                  {t("reporter", { name: report.reporterName })}
                  {report.reason && t("reason", { reason: report.reason })}
                </p>
                <ReportActions
                  reportId={report.id}
                  canDelete={report.targetKind !== "user"}
                />
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
};

export default AdminReportsPage;
