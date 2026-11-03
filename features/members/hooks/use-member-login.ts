"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { toast } from "sonner";

import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import {
  changeMemberEmailAction,
  resetMemberPasswordAction,
} from "@/features/members/services/member-login-actions";
import { describeErrorReference } from "@/utils/errors";

export const useMemberLogin = (userId: number, email: string | null) => {
  const router = useRouter();
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
      toast.success("Đã đổi email");
      router.refresh();
    });
  };

  const resetPassword = () => {
    if (!window.confirm(MEMBER_MESSAGES.RESET_CONFIRM)) {
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
