"use client";

import { LogOut } from "lucide-react";

import { ICON_BUTTON } from "@/constants/styles";
import {
  logoutAdminAction,
  logoutUserAction,
} from "@/features/auth/services/auth-actions";
import { forgetRememberedName } from "@/features/auth/utils/remembered-name";

interface LogoutButtonProps {
  role: "user" | "admin";
}

export const LogoutButton = ({ role }: LogoutButtonProps) => {
  const isUser = role === "user";

  // An explicit logout also forgets the name kept on this device.
  const handleSubmit = () => {
    if (isUser) {
      forgetRememberedName();
    }
  };

  return (
    <form
      action={isUser ? logoutUserAction : logoutAdminAction}
      onSubmit={handleSubmit}
    >
      <button type="submit" className={ICON_BUTTON} aria-label="Đăng xuất">
        <LogOut className="size-5" />
      </button>
    </form>
  );
};
