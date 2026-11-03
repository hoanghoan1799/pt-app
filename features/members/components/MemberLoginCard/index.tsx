"use client";

import { KeyRound, Pencil } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  FIELD_ERROR,
  INPUT,
  SECTION_TITLE,
} from "@/constants/styles";
import { OneTimePassword } from "@/features/members/components/OneTimePassword";
import { MEMBER_MESSAGES } from "@/features/members/constants/messages";
import { useMemberLogin } from "@/features/members/hooks/use-member-login";

interface MemberLoginCardProps {
  userId: number;
  name: string;
  email: string | null;
}

export const MemberLoginCard = ({
  userId,
  name,
  email,
}: MemberLoginCardProps) => {
  const login = useMemberLogin(userId, email);

  return (
    <section className="space-y-3">
      <h2 className={SECTION_TITLE}>Tài khoản đăng nhập</h2>
      <div className={`${CARD} space-y-3 p-4`}>
        {login.isEditing ? (
          <form onSubmit={login.saveEmail} className="space-y-3">
            <label htmlFor="member-login-email" className="sr-only">
              Email đăng nhập
            </label>
            <input
              id="member-login-email"
              name="email"
              type="email"
              inputMode="email"
              defaultValue={email ?? ""}
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              required
              autoFocus
              aria-invalid={Boolean(login.emailError)}
              className={INPUT}
            />
            {login.emailError && (
              <p role="alert" className={FIELD_ERROR}>
                {login.emailError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={login.cancelEditing}
                className={`${BUTTON_SECONDARY} flex-1`}
              >
                Hủy
              </button>
              <SubmitButton
                isPending={login.isSaving}
                className={`${BUTTON_PRIMARY} flex-1`}
              >
                Lưu
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p
              className={`min-w-0 truncate ${email ? "text-fg" : "text-muted"}`}
            >
              {email ?? MEMBER_MESSAGES.NO_EMAIL}
            </p>
            <button
              type="button"
              onClick={login.startEditing}
              className="flex min-h-11 shrink-0 items-center gap-1.5 px-2 text-sm font-medium text-fg"
            >
              <Pencil className="size-4" aria-hidden />
              Đổi email
            </button>
          </div>
        )}
        {login.password ? (
          <OneTimePassword
            name={name}
            email={email ?? ""}
            password={login.password}
            onDone={login.dismissPassword}
          />
        ) : (
          email && (
            <button
              type="button"
              onClick={login.resetPassword}
              disabled={login.isResetting}
              className={`${BUTTON_SECONDARY} w-full`}
            >
              <KeyRound className="size-5" aria-hidden />
              Đặt lại mật khẩu
            </button>
          )
        )}
      </div>
    </section>
  );
};
