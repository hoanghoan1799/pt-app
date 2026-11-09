"use client";

import { UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/common/Input";
import { SubmitButton } from "@/components/common/SubmitButton";
import { BUTTON_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "@/constants/styles";
import { OneTimePassword } from "@/features/members/components/OneTimePassword";
import { useCreateMember } from "@/features/members/hooks/use-create-member";

interface CreateMemberFormProps {
  // Set for a super admin: the "PT phụ trách" choices. A PT's trainees always
  // join their own workspace, so no select is shown.
  ptOptions?: { id: number; username: string }[];
  // Called when the admin dismisses the one-time password panel.
  onDone?: () => void;
}

export const CreateMemberForm = ({
  ptOptions,
  onDone,
}: CreateMemberFormProps) => {
  const t = useTranslations("members.createMember");
  const {
    formAction,
    nameError,
    emailError,
    ptError,
    defaultName,
    defaultEmail,
    credentials,
    dismissPassword,
  } = useCreateMember(onDone);

  if (credentials) {
    return <OneTimePassword {...credentials} onDone={dismissPassword} />;
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="member-name" className={LABEL}>
          {t("nameLabel")}
        </label>
        <Input
          clearable
          key={defaultName}
          id="member-name"
          name="name"
          defaultValue={defaultName}
          placeholder={t("namePlaceholder")}
          autoCapitalize="words"
          autoCorrect="off"
          enterKeyHint="next"
          required
          aria-invalid={Boolean(nameError)}
        />
        {nameError && (
          <p role="alert" className={FIELD_ERROR}>
            {nameError}
          </p>
        )}
      </div>
      <div>
        <label htmlFor="member-email" className={LABEL}>
          {t("emailLabel")}
        </label>
        <Input
          clearable
          key={defaultEmail}
          id="member-email"
          name="email"
          type="email"
          inputMode="email"
          defaultValue={defaultEmail}
          placeholder={t("emailPlaceholder")}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          enterKeyHint="done"
          required
          aria-invalid={Boolean(emailError)}
        />
        {emailError && (
          <p role="alert" className={FIELD_ERROR}>
            {emailError}
          </p>
        )}
      </div>
      {ptOptions && (
        <div>
          <label htmlFor="member-pt" className={LABEL}>
            {t("ptLabel")}
          </label>
          <select
            id="member-pt"
            name="ptAdminId"
            defaultValue=""
            aria-invalid={Boolean(ptError)}
            className={INPUT}
          >
            <option value="">{t("ptUnassigned")}</option>
            {ptOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.username}
              </option>
            ))}
          </select>
          {ptError && (
            <p role="alert" className={FIELD_ERROR}>
              {ptError}
            </p>
          )}
        </div>
      )}
      {/* Pinned to the sheet's bottom edge so it stays reachable while the
          keyboard is up; the negative margin cancels the sheet's own padding. */}
      <div className="sticky bottom-0 -mb-[calc(env(safe-area-inset-bottom)+1.25rem)] bg-bg pt-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
        <SubmitButton className={`${BUTTON_PRIMARY} w-full`}>
          <UserPlus className="size-5" aria-hidden />
          {t("submit")}
        </SubmitButton>
      </div>
    </form>
  );
};
