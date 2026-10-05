import { LogOut } from "lucide-react";

import { ICON_BUTTON } from "@/constants/styles";
import {
  logoutAdminAction,
  logoutUserAction,
} from "@/features/auth/services/auth-actions";

interface LogoutButtonProps {
  role: "user" | "admin";
}

export const LogoutButton = ({ role }: LogoutButtonProps) => (
  <form action={role === "admin" ? logoutAdminAction : logoutUserAction}>
    <button type="submit" className={ICON_BUTTON} aria-label="Đăng xuất">
      <LogOut className="size-5" />
    </button>
  </form>
);
