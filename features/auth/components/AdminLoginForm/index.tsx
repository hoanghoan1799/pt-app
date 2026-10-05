"use client";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { useLoginForm } from "@/features/auth/hooks/use-login-form";
import { loginAdminAction } from "@/features/auth/services/auth-actions";

export const AdminLoginForm = () => {
  const { formAction, errorMessage } = useLoginForm(loginAdminAction);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="password" className={LABEL}>
          Mật khẩu admin
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "password-error" : undefined}
          className={INPUT}
        />
        {errorMessage && (
          <p id="password-error" role="alert" className={FIELD_ERROR}>
            {errorMessage}
          </p>
        )}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        Đăng nhập
      </SubmitButton>
    </form>
  );
};
