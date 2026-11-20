"use client";

import { Ban, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Spinner } from "@/components/common/Spinner";
import { BUTTON_DANGER, BUTTON_SECONDARY, CARD } from "@/constants/styles";
import { BlockUserSheet } from "@/features/restrictions/components/BlockUserSheet";
import { RestrictionSummary } from "@/features/restrictions/components/RestrictionSummary";
import { liftRestrictionAction } from "@/features/restrictions/services/restriction-actions";
import type { ActiveRestriction } from "@/features/restrictions/types/restriction";

interface BlockUserControlProps {
  userId: number;
  // The trainee's active restriction, null when they are not blocked.
  restriction: ActiveRestriction | null;
}

// Super admin tools on the trainee page: "Chặn" (opens the sheet) or, while a
// block is active, its status with "Gỡ chặn". The page only renders this for a
// super admin, and every action re-checks it on the server.
export const BlockUserControl = ({
  userId,
  restriction,
}: BlockUserControlProps) => {
  const t = useTranslations("restrictions.control");
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const lift = () => {
    startTransition(async () => {
      try {
        const result = await liftRestrictionAction(userId);

        if (result.status === "error") {
          toast.error(result.message);
          router.refresh();
          return;
        }
        toast.success(t("lifted"));
        router.refresh();
      } catch {
        toast.error(t("liftFailed"));
      }
    });
  };

  return (
    <>
      {restriction ? (
        <div className={`${CARD} space-y-3 p-4`}>
          <RestrictionSummary restriction={restriction} />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={lift}
              disabled={isPending}
              aria-busy={isPending}
              className={BUTTON_SECONDARY}
            >
              {isPending ? (
                <Spinner size="md" />
              ) : (
                <ShieldCheck className="size-5" aria-hidden />
              )}
              {t("lift")}
            </button>
            <button
              type="button"
              onClick={() => setIsSheetOpen(true)}
              disabled={isPending}
              className={BUTTON_DANGER}
            >
              <Ban className="size-5" aria-hidden />
              {t("change")}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsSheetOpen(true)}
          className={`${BUTTON_DANGER} w-full`}
        >
          <Ban className="size-5" aria-hidden />
          {t("trigger")}
        </button>
      )}
      <BlockUserSheet
        userId={userId}
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onBlocked={() => router.refresh()}
      />
    </>
  );
};
