"use client";

import { useTranslations } from "next-intl";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { useLoginForm } from "@/features/auth/hooks/use-login-form";
import { loginAdminAction } from "@/features/auth/services/auth-actions";
import { describeErrorReference } from "@/utils/errors";

export const AdminLoginForm = () => {
  const t = useTranslations("auth.adminLogin");
  const { formAction, errorMessage, errorReference, values } =
    useLoginForm(loginAdminAction);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="username" className={LABEL}>
          {t("usernameLabel")}
        </label>
        <input
          key={values.username}
          id="username"
          name="username"
          defaultValue={values.username}
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="next"
          required
          aria-invalid={Boolean(errorMessage)}
          className={INPUT}
        />
      </div>
      <div>
        <label htmlFor="password" className={LABEL}>
          {t("passwordLabel")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          enterKeyHint="go"
          required
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "login-error" : undefined}
          className={INPUT}
        />
        {errorMessage && (
          <p id="login-error" role="alert" className={FIELD_ERROR}>
            {errorMessage}
            {errorReference && (
              <span className="mt-0.5 block font-mono text-xs opacity-80">
                {describeErrorReference(errorReference)}
              </span>
            )}
          </p>
        )}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
};
