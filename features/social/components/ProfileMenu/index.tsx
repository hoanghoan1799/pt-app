"use client";

import { Ban, Flag, MoreHorizontal } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Spinner } from "@/components/common/Spinner";
import { ROUTES } from "@/constants/routes";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { blockUserAction } from "@/features/social/services/friend-actions";
import { useHasOpened } from "@/hooks/use-has-opened";

interface ProfileMenuProps {
  mode: "user" | "admin";
  userId: number;
  name: string;
  // Only trainees block trainees.
  canBlock: boolean;
  // Admin accounts are not reportable.
  canReport: boolean;
}

// Opened from a menu item, so its code loads on first open.
const ReportSheet = dynamic(
  () =>
    import("@/features/social/components/ReportSheet").then(
      (module) => module.ReportSheet,
    ),
  { ssr: false },
);

const MENU_ITEM =
  "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium active:bg-line/70";

// The "…" on someone else's profile: Chặn and Báo cáo.
export const ProfileMenu = ({
  mode,
  userId,
  name,
  canBlock,
  canReport,
}: ProfileMenuProps) => {
  const t = useTranslations("social.profileMenu");
  const router = useRouter();
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const hasReportOpened = useHasOpened(isReportOpen);
  const { isPending, run } = useSocialAction();

  const handleBlock = async () => {
    setMenuOpen(false);
    const isConfirmed = await confirm({
      title: t("blockTitle", { name }),
      description: t("blockDescription"),
      confirmLabel: t("block"),
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => blockUserAction(userId), {
        successMessage: t("blocked"),
        onSuccess: () => router.replace(ROUTES.FRIENDS),
      });
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={isPending}
        aria-busy={isPending}
        aria-label={t("optionsLabel")}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-line text-muted active:bg-line disabled:opacity-50"
      >
        {isPending ? (
          <Spinner size="md" />
        ) : (
          <MoreHorizontal className="size-5" aria-hidden />
        )}
      </button>
      <BottomSheet isOpen={isMenuOpen} onOpenChange={setMenuOpen} title={name}>
        <div className="space-y-1 pb-2">
          {canBlock && (
            <button
              type="button"
              className={`${MENU_ITEM} text-danger`}
              onClick={handleBlock}
            >
              <Ban className="size-5" aria-hidden />
              {t("block")}
            </button>
          )}
          {canReport && (
            <button
              type="button"
              className={MENU_ITEM}
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              <Flag className="size-5" aria-hidden />
              {t("report")}
            </button>
          )}
        </div>
      </BottomSheet>
      {canReport && hasReportOpened && (
        <ReportSheet
          isOpen={isReportOpen}
          onOpenChange={setReportOpen}
          mode={mode}
          targetKind="user"
          targetId={userId}
        />
      )}
    </>
  );
};
