"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import {
  saveBodyProfileAction,
  saveMyBodyProfileAction,
} from "@/features/nutrition/services/nutrition-actions";
import type {
  BodyProfile,
  BodyProfileEditor,
} from "@/features/nutrition/types/nutrition";
import {
  type BodyProfileDraft,
  calculateEnergyPlan,
  formatDecimal,
  getAge,
  toBodyProfile,
} from "@/features/nutrition/utils/energy";
import { useFormFeedback } from "@/hooks/use-form-feedback";

interface UseBodyProfileFormOptions {
  editor: BodyProfileEditor;
  profile: BodyProfile | null;
  today: string;
  onSaved: () => void;
}

const toDraft = (
  profile: BodyProfile | null,
  today: string,
): BodyProfileDraft => ({
  sex: profile?.sex ?? "male",
  age: profile ? String(getAge(profile.birthYear, today)) : "",
  heightCm: profile ? formatDecimal(profile.heightCm) : "",
  weightKg: profile ? formatDecimal(profile.weightKg) : "",
  activityLevel: profile?.activityLevel ?? "moderate",
  goal: profile?.goal ?? "maintain",
});

export const useBodyProfileForm = ({
  editor,
  profile,
  today,
  onSaved,
}: UseBodyProfileFormOptions) => {
  const [state, formAction, isPending] = useActionState(
    editor === "admin" ? saveBodyProfileAction : saveMyBodyProfileAction,
    INITIAL_FORM_STATE,
  );
  const [draft, setDraft] = useState(() => toDraft(profile, today));
  const parsedProfile = toBodyProfile(draft, today);

  useFormFeedback(state, onSaved);

  const handleChange = <Key extends keyof BodyProfileDraft>(
    key: Key,
    value: BodyProfileDraft[Key],
  ) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  // Submitted through a transition so React doesn't reset the fields when
  // the server returns validation errors.
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    startTransition(() => formAction(formData));
  };

  return {
    draft,
    plan: parsedProfile ? calculateEnergyPlan(parsedProfile, today) : null,
    isPending,
    fieldErrors: state.status === "error" ? (state.fieldErrors ?? {}) : {},
    handleChange,
    handleSubmit,
  };
};
