import type { Metadata } from "next";
import Link from "next/link";

import { AppHeader } from "@/components/layout/AppHeader";
import { ROUTES } from "@/constants/routes";
import { CARD, PAGE_CONTAINER, SECTION_TITLE } from "@/constants/styles";
import { TIME_ZONE } from "@/constants/time";
import { ReportActions } from "@/features/social/components/ReportActions";
import { listOpenReports } from "@/features/social/services/report-queries";
import { requireSuperAdmin } from "@/services/auth-guard";
import { formatRelativeTime } from "@/utils/time";

export const metadata: Metadata = { title: "Báo cáo" };

const KIND_LABELS = {
  post: "Bài viết",
  comment: "Bình luận",
  user: "Người dùng",
} as const;

// Super admin only (spec M1, A14): open reports with a preview of the target.
const AdminReportsPage = async () => {
  await requireSuperAdmin();

  const reports = await listOpenReports();

  return (
    <>
      <AppHeader eyebrow="Admin" title="Báo cáo" backHref={ROUTES.ADMIN} />
      <main
        className={`${PAGE_CONTAINER} space-y-3 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
      >
        <h2 className={SECTION_TITLE}>Đang chờ · {reports.length}</h2>
        {reports.length === 0 ? (
          <p className={`${CARD} p-6 text-center text-muted`}>
            Không có báo cáo nào.
          </p>
        ) : (
          <ul className="space-y-3">
            {reports.map((report) => (
              <li key={report.id} className={`${CARD} space-y-3 p-4`}>
                <p className="text-sm text-muted">
                  <span className="font-semibold text-fg">
                    {KIND_LABELS[report.targetKind]}
                  </span>
                  {report.targetName && ` · ${report.targetName}`}
                  {" · "}
                  {formatRelativeTime(report.createdAt, TIME_ZONE)}
                </p>
                {report.preview !== null ? (
                  <p className="text-base break-words whitespace-pre-wrap text-fg">
                    {report.preview || "(Trống)"}
                  </p>
                ) : report.targetKind !== "user" ? (
                  <p className="text-base text-muted italic">
                    Nội dung đã bị xóa.
                  </p>
                ) : null}
                {report.href && (
                  <Link
                    href={report.href}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-accent"
                  >
                    {report.targetKind === "user" ? "Xem trang cá nhân" : "Xem"}
                  </Link>
                )}
                <p className="text-sm break-words text-muted">
                  Người báo cáo: {report.reporterName}
                  {report.reason && ` · "${report.reason}"`}
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
