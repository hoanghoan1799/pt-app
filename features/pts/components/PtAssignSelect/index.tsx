"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { INPUT, LABEL } from "@/constants/styles";
import { PT_MESSAGES } from "@/features/pts/constants/messages";
import { assignTraineePtAction } from "@/features/pts/services/pt-actions";

interface PtAssignSelectProps {
  userId: number;
  currentPtId: number | null;
  options: { id: number; username: string }[];
}

// "PT phụ trách" on the trainee page (super admin only).
export const PtAssignSelect = ({
  userId,
  currentPtId,
  options,
}: PtAssignSelectProps) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleChange = (value: string) => {
    startTransition(async () => {
      const result = await assignTraineePtAction(
        userId,
        value === "" ? null : Number(value),
      );

      if (result.status !== "success") {
        toast.error(result.message);
        router.refresh();
        return;
      }
      toast.success(PT_MESSAGES.ASSIGNED);
      router.refresh();
    });
  };

  return (
    <div>
      <label htmlFor="pt-assign" className={LABEL}>
        PT phụ trách
      </label>
      <select
        id="pt-assign"
        value={currentPtId ?? ""}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className={INPUT}
      >
        <option value="">Chưa giao (chỉ super admin)</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.username}
          </option>
        ))}
      </select>
    </div>
  );
};
