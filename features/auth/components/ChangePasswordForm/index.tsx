"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/common/SubmitButton";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { ROUTES } from "@/constants/routes";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { changePasswordAction } from "@/features/auth/services/password-actions";
import { describeErrorReference } from "@/utils/errors";

const FIELDS = [
  {
    name: "currentPassword",
    labelKey: "fields.currentPassword",
    autoComplete: "current-password",
  },
  {
    name: "newPassword",
    labelKey: "fields.newPassword",
    autoComplete: "new-password",
  },
  {
    name: "confirmPassword",
    labelKey: "fields.confirmPassword",
    autoComplete: "new-password",
  },
] as const;

export const ChangePasswordForm = () => {
  const t = useTranslations("auth.changePassword");
  const router = useRouter();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [state, formAction] = useActionState(
    changePasswordAction,
    INITIAL_FORM_STATE,
  );

  // The toaster lives in the root layout, so the toast outlives the redirect.
  // Only trainees have this page; the admin app has no password page yet.
  useEffect(() => {
    if (state.status === "success") {
      toast.success(t("toastSuccess"));
      router.replace(ROUTES.WORKOUTS);
    }
  }, [state.status, state.submittedAt, router, t]);

  const isError = state.status === "error";
  const fieldErrors = state.fieldErrors ?? {};
  // Errors without a field (wrong current password is per-field, so this is
  // mostly unexpected failures) are shown under the last input.
  const formError =
    isError && Object.keys(fieldErrors).length === 0
      ? state.message
      : undefined;

  return (
    // New key after a success clears the three inputs.
    <form
      key={state.status === "success" ? state.submittedAt : "form"}
      action={formAction}
      className="space-y-4"
    >
      {FIELDS.map((field) => {
        const error = fieldErrors[field.name];
        const isVisible = Boolean(visible[field.name]);

        return (
          <div key={field.name}>
            <label htmlFor={field.name} className={LABEL}>
              {t(field.labelKey)}
            </label>
            <div className="relative">
              <input
                id={field.name}
                name={field.name}
                type={isVisible ? "text" : "password"}
                autoComplete={field.autoComplete}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? `${field.name}-error` : undefined}
                className={`${INPUT} pr-12`}
              />
              <button
                type="button"
                aria-label={isVisible ? t("hidePassword") : t("showPassword")}
                aria-pressed={isVisible}
                onClick={() =>
                  setVisible((prev) => ({
                    ...prev,
                    [field.name]: !prev[field.name],
                  }))
                }
                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-muted hover:text-fg focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:outline-none"
              >
                {isVisible ? (
                  <EyeOff className="size-5" aria-hidden />
                ) : (
                  <Eye className="size-5" aria-hidden />
                )}
              </button>
            </div>
            {error && (
              <p
                id={`${field.name}-error`}
                role="alert"
                className={FIELD_ERROR}
              >
                {error}
              </p>
            )}
          </div>
        );
      })}
      {formError && (
        <p role="alert" className={FIELD_ERROR}>
          {formError}
          {state.errorReference && (
            <span className="mt-0.5 block font-mono text-xs opacity-80">
              {describeErrorReference(state.errorReference)}
            </span>
          )}
        </p>
      )}
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        {t("submit")}
      </SubmitButton>
    </form>
  );
};
