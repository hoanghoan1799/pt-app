"use client";

import { ArrowRight } from "lucide-react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { useLoginForm } from "@/features/auth/hooks/use-login-form";
import { loginUserAction } from "@/features/auth/services/auth-actions";

export const UserLoginForm = () => {
  const { formAction, errorMessage, values } = useLoginForm(loginUserAction);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className={LABEL}>
          Tên của bạn
        </label>
        <input
          id="name"
          name="name"
          defaultValue={values.name}
          placeholder="VD: Nguyễn Văn An"
          autoComplete="name"
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="go"
          required
          aria-invalid={Boolean(errorMessage)}
          aria-describedby={errorMessage ? "name-error" : undefined}
          className={INPUT}
        />
        {errorMessage && (
          <p id="name-error" role="alert" className={FIELD_ERROR}>
            {errorMessage}
          </p>
        )}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        Vào tập
        <ArrowRight className="size-5" aria-hidden />
      </SubmitButton>
    </form>
  );
};
