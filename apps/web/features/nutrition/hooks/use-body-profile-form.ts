"use client";

import {
  type FormEvent,
  startTransition,
  useActionState,
  useState,
} from "react";

import { INITIAL_FORM_STATE } from "@/constants/form";
import {
  GOALS,
  PROTEIN_PER_KG_DEFAULT,
} from "@/features/nutrition/constants/energy";
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
  getLegacyKcalAdjustment,
  toBodyProfile,
} from "@/features/nutrition/utils/energy";
import { useFormFeedback } from "@/hooks/use-form-feedback";

interface UseBodyProfileFormOptions {
  editor: BodyProfileEditor;
  profile: BodyProfile | null;
  today: string;
  onSaved: () => void;
}

// The PT sees the energy model filled in: what is stored, else for a legacy
// profile the values its old goal gave (so saving untouched keeps the target),
// else for a new profile the protein default by sex. A member's own form
// leaves the PT-only fields as stored (empty = not set).
const toDraft = (
  editor: BodyProfileEditor,
  profile: BodyProfile | null,
  today: string,
): BodyProfileDraft => {
  const sex = profile?.sex ?? "male";
  const isAdmin = editor === "admin";
  const kcalAdjustment =
    profile?.kcalAdjustment ??
    (isAdmin ? (profile ? getLegacyKcalAdjustment(profile, today) : 0) : null);
  const proteinPerKg =
    profile?.proteinPerKg ??
    (isAdmin
      ? profile
        ? GOALS[profile.goal].proteinPerKg
        : PROTEIN_PER_KG_DEFAULT[sex]
      : null);

  return {
    sex,
    age: profile ? String(getAge(profile.birthYear, today)) : "",
    heightCm: profile ? formatDecimal(profile.heightCm) : "",
    weightKg: profile ? formatDecimal(profile.weightKg) : "",
    activityLevel: profile?.activityLevel ?? "moderate",
    goal: profile?.goal ?? "maintain",
    kcalAdjustment: kcalAdjustment === null ? "" : String(kcalAdjustment),
    proteinPerKg: proteinPerKg === null ? "" : formatDecimal(proteinPerKg),
  };
};

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
  const [draft, setDraft] = useState(() => toDraft(editor, profile, today));
  const parsedProfile = toBodyProfile(draft, today);

  useFormFeedback(state, onSaved);

  const handleChange = <Key extends keyof BodyProfileDraft>(
    key: Key,
    value: BodyProfileDraft[Key],
  ) => {
    setDraft((previous) => {
      const next = { ...previous, [key]: value };

      // On a new profile an untouched protein default follows the sex.
      if (
        key === "sex" &&
        editor === "admin" &&
        !profile &&
        previous.proteinPerKg ===
          formatDecimal(PROTEIN_PER_KG_DEFAULT[previous.sex])
      ) {
        next.proteinPerKg = formatDecimal(
          PROTEIN_PER_KG_DEFAULT[value as BodyProfile["sex"]],
        );
      }
      return next;
    });
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
