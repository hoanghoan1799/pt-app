"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import { SubmitButton } from "@/components/common/SubmitButton";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { ROUTES } from "@/constants/routes";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { AUTH_MESSAGES } from "@/features/auth/constants/messages";
import { changePasswordAction } from "@/features/auth/services/password-actions";
import { describeErrorReference } from "@/utils/errors";

const FIELDS = [
  {
    name: "currentPassword",
    label: "Mật khẩu hiện tại",
    autoComplete: "current-password",
  },
  { name: "newPassword", label: "Mật khẩu mới", autoComplete: "new-password" },
  {
    name: "confirmPassword",
    label: "Nhập lại mật khẩu mới",
    autoComplete: "new-password",
  },
] as const;

export const ChangePasswordForm = () => {
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
      toast.success(AUTH_MESSAGES.PASSWORD_CHANGED_TOAST);
      router.replace(ROUTES.WORKOUTS);
    }
  }, [state.status, state.submittedAt, router]);

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
              {field.label}
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
                aria-label={isVisible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
        Đổi mật khẩu
      </SubmitButton>
    </form>
  );
};
