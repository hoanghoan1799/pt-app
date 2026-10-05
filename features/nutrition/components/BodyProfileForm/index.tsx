"use client";

import { BodyProfileFormView } from "@/features/nutrition/components/BodyProfileFormView";
import { useBodyProfileForm } from "@/features/nutrition/hooks/use-body-profile-form";
import type { BodyProfile } from "@/features/nutrition/types/nutrition";

interface BodyProfileFormProps {
  userId: number;
  profile: BodyProfile | null;
  today: string;
  onSaved: () => void;
}

export const BodyProfileForm = ({
  userId,
  profile,
  today,
  onSaved,
}: BodyProfileFormProps) => {
  const form = useBodyProfileForm({ profile, today, onSaved });

  return (
    <BodyProfileFormView
      userId={userId}
      draft={form.draft}
      plan={form.plan}
      isPending={form.isPending}
      fieldErrors={form.fieldErrors}
      onChange={form.handleChange}
      onSubmit={form.handleSubmit}
    />
  );
};
