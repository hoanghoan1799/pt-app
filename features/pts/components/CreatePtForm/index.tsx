"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { BUTTON_PRIMARY, FIELD_ERROR, LABEL } from "@/constants/styles";
import { createPtAction } from "@/features/pts/services/pt-actions";
import { useFormFeedback } from "@/hooks/use-form-feedback";

export const CreatePtForm = () => {
  const t = useTranslations("pts.createPt");
  const [state, formAction] = useActionState(
    createPtAction,
    INITIAL_FORM_STATE,
  );

  useFormFeedback(state);

  const usernameError = state.fieldErrors?.username;
  const passwordError = state.fieldErrors?.password;

  return (
    <form
      key={state.status === "success" ? state.submittedAt : "form"}
      action={formAction}
      className="space-y-4"
    >
      <div>
        <label htmlFor="pt-username" className={LABEL}>
          {t("usernameLabel")}
        </label>
        <Input
          clearable
          id="pt-username"
          name="username"
          defaultValue={state.status === "error" ? state.values?.username : ""}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          required
          aria-invalid={Boolean(usernameError)}
        />
        {usernameError && (
          <p role="alert" className={FIELD_ERROR}>
            {usernameError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="pt-password" className={LABEL}>
          {t("passwordLabel")}
        </label>
        <Input
          id="pt-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(passwordError)}
        />
        {passwordError && (
          <p role="alert" className={FIELD_ERROR}>
            {passwordError}
          </p>
        )}
      </div>
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        <UserPlus className="size-5" aria-hidden />
        {t("submit")}
      </SubmitButton>
    </form>
  );
};
