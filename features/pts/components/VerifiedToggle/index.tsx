"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { BUTTON_SECONDARY } from "@/constants/styles";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import { setAdminVerifiedAction } from "@/features/pts/services/pt-actions";

interface VerifiedToggleProps {
  adminId: number;
  verified: boolean;
}

export const VerifiedToggle = ({ adminId, verified }: VerifiedToggleProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await setAdminVerifiedAction(adminId, !verified);

      if (result.status !== "success") {
        toast.error(result.message);
        return;
      }
      toast.success(verified ? PT_MESSAGES.VERIFY_OFF : PT_MESSAGES.VERIFY_ON);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`${BUTTON_SECONDARY} min-h-9 px-3 text-sm`}
    >
      {verified ? "Gỡ tick" : "Cấp tick"}
    </button>
  );
};
