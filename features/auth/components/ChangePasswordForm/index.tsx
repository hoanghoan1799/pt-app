"use client";

import { useActionState } from "react";

import { SubmitButton } from "@/components/common/SubmitButton";
import { INITIAL_FORM_STATE } from "@/constants/form";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
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
  const [state, formAction] = useActionState(
    changePasswordAction,
    INITIAL_FORM_STATE,
  );
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

        return (
          <div key={field.name}>
            <label htmlFor={field.name} className={LABEL}>
              {field.label}
            </label>
            <input
              id={field.name}
              name={field.name}
              type="password"
              autoComplete={field.autoComplete}
              required
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${field.name}-error` : undefined}
              className={INPUT}
            />
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
      {state.status === "success" && (
        <p role="status" className="text-sm font-medium text-success">
          {state.message}
        </p>
      )}
      <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
        Đổi mật khẩu
      </SubmitButton>
    </form>
  );
};
