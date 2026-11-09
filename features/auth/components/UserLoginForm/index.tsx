"use client";

import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { useLoginForm } from "@/features/auth/hooks/use-login-form";
import { loginWithEmailAction } from "@/features/auth/services/auth-actions";
import { describeErrorReference } from "@/utils/errors";

export const UserLoginForm = () => {
  const t = useTranslations("auth.userLogin");
  const { formAction, errorMessage, errorReference, values } =
    useLoginForm(loginWithEmailAction);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className={LABEL}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={values.email ?? ""}
          placeholder={t("emailPlaceholder")}
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          required
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "login-error" : undefined}
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
        <ArrowRight className="size-5" aria-hidden />
      </SubmitButton>
      <p className="text-center text-sm text-muted">{t("forgotPassword")}</p>
    </form>
  );
};
