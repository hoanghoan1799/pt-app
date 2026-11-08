"use client";

import { Ban, Flag, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { ROUTES } from "@/constants/routes";
import { ReportSheet } from "@/features/social/components/ReportSheet";
import { FRIEND_MESSAGES } from "@/features/social/constants/social";
import { useSocialAction } from "@/features/social/hooks/use-social-action";
import { blockUserAction } from "@/features/social/services/friend-actions";

interface ProfileMenuProps {
  mode: "user" | "admin";
  userId: number;
  name: string;
  // Only trainees block trainees.
  canBlock: boolean;
  // Admin accounts are not reportable.
  canReport: boolean;
}

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
  const router = useRouter();
  const confirm = useConfirm();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isReportOpen, setReportOpen] = useState(false);
  const { isPending, run } = useSocialAction();

  const handleBlock = async () => {
    setMenuOpen(false);
    const isConfirmed = await confirm({
      title: `Chặn ${name}?`,
      description:
        "Hai bạn sẽ không tìm thấy, không xem được bài viết và bình luận của nhau. Tình bạn (nếu có) sẽ bị huỷ.",
      confirmLabel: "Chặn",
      isDanger: true,
    });

    if (isConfirmed) {
      run(() => blockUserAction(userId), {
        successMessage: FRIEND_MESSAGES.BLOCKED,
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
        aria-label="Tùy chọn"
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl border border-line text-muted active:bg-line disabled:opacity-50"
      >
        <MoreHorizontal className="size-5" aria-hidden />
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
              Chặn
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
              Báo cáo
            </button>
          )}
        </div>
      </BottomSheet>
      {canReport && (
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
