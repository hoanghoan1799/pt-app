"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import {
  changeMemberEmailAction,
  resetMemberPasswordAction,
} from "@/features/members/services/member-login-actions";
import { describeErrorReference } from "@/utils/errors";

export const useMemberLogin = (userId: number, email: string | null) => {
  const t = useTranslations("members.memberLogin");
  const router = useRouter();
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [password, setPassword] = useState<string>();
  const [isSaving, startSave] = useTransition();
  const [isResetting, startReset] = useTransition();

  const startEditing = () => {
    setEmailError(undefined);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEmailError(undefined);
    setIsEditing(false);
  };

  const saveEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = String(new FormData(event.currentTarget).get("email"));

    startSave(async () => {
      const result = await changeMemberEmailAction(userId, nextEmail);

      if (result.status === "error") {
        setEmailError(result.message);
        return;
      }
      setIsEditing(false);
      setEmailError(undefined);
      toast.success(t("emailChanged"));
      router.refresh();
    });
  };

  const resetPassword = async () => {
    const isConfirmed = await confirm({
      title: t("resetConfirmTitle"),
      confirmLabel: t("resetConfirmLabel"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    startReset(async () => {
      const result = await resetMemberPasswordAction(userId);

      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      setPassword(result.password);
    });
  };

  return {
    email,
    isEditing,
    emailError,
    password,
    isSaving,
    isResetting,
    startEditing,
    cancelEditing,
    saveEmail,
    resetPassword,
    dismissPassword: () => setPassword(undefined),
  };
};
