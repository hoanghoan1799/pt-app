"use client";

import { BodyProfileFormView } from "@/features/nutrition/components/BodyProfileFormView";
import { useBodyProfileForm } from "@/features/nutrition/hooks/use-body-profile-form";
import type {
  BodyProfile,
  BodyProfileEditor,
} from "@/features/nutrition/types/nutrition";

interface BodyProfileFormProps {
  editor: BodyProfileEditor;
  userId?: number;
  profile: BodyProfile | null;
  isTargetManual: boolean;
  today: string;
  onSaved: () => void;
}

export const BodyProfileForm = ({
  editor,
  userId,
  profile,
  isTargetManual,
  today,
  onSaved,
}: BodyProfileFormProps) => {
  const form = useBodyProfileForm({ editor, profile, today, onSaved });

  return (
    <BodyProfileFormView
      editor={editor}
      userId={userId}
      isTargetManual={isTargetManual}
      draft={form.draft}
      plan={form.plan}
      isPending={form.isPending}
      fieldErrors={form.fieldErrors}
      onChange={form.handleChange}
      onSubmit={form.handleSubmit}
    />
  );
};
