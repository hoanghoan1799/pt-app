"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { toast } from "sonner";

import { INPUT, LABEL } from "@/constants/styles";
import { assignTraineePtAction } from "@/features/pts/services/pt-actions";

interface PtAssignSelectProps {
  userId: number;
  currentPtId: number | null;
  options: { id: number; username: string }[];
  // Visible label; defaults to "PT phụ trách" (translated).
  label?: string;
}

// "PT phụ trách" on the trainee page (super admin only).
export const PtAssignSelect = ({
  userId,
  currentPtId,
  options,
  label,
}: PtAssignSelectProps) => {
  const t = useTranslations("pts.ptAssign");
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
      toast.success(t("assigned"));
      router.refresh();
    });
  };

  return (
    <div>
      <label htmlFor={`pt-assign-${userId}`} className={LABEL}>
        {label ?? t("label")}
      </label>
      <select
        id={`pt-assign-${userId}`}
        value={currentPtId ?? ""}
        disabled={isPending}
        onChange={(event) => handleChange(event.target.value)}
        className={INPUT}
      >
        <option value="">{t("unassigned")}</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.username}
          </option>
        ))}
      </select>
    </div>
  );
};
