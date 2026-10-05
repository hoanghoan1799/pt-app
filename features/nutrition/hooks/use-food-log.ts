"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { NUTRITION_MESSAGES } from "@/features/nutrition/constants/nutrition";
import { deleteFoodEntryAction } from "@/features/nutrition/services/nutrition-actions";
import type { FoodEntry } from "@/features/nutrition/types/nutrition";
import { describeErrorReference } from "@/utils/errors";

interface EntrySheetState {
  isOpen: boolean;
  entry: FoodEntry | null;
  // Remounts the form on every open so "add" always starts empty.
  formKey: number;
}

export const useFoodLog = () => {
  const [sheet, setSheet] = useState<EntrySheetState>({
    isOpen: false,
    entry: null,
    formKey: 0,
  });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const openSheet = (entry: FoodEntry | null) => {
    setSheet((previous) => ({
      isOpen: true,
      entry,
      formKey: previous.formKey + 1,
    }));
  };

  // Keeps `entry` while closing so the sheet doesn't flash during the animation.
  const handleSheetChange = (isOpen: boolean) => {
    setSheet((previous) => ({ ...previous, isOpen }));
  };

  const handleDelete = (entry: FoodEntry) => {
    if (!window.confirm(NUTRITION_MESSAGES.DELETE_CONFIRM)) {
      return;
    }

    setPendingId(entry.id);
    startTransition(async () => {
      const result = await deleteFoodEntryAction(entry.id);

      setPendingId(null);
      if (result.status === "error") {
        toast.error(result.message, {
          description: describeErrorReference(result.reference),
        });
        return;
      }
      toast.success(NUTRITION_MESSAGES.ENTRY_DELETED);
    });
  };

  return {
    sheet,
    pendingId,
    handleAdd: () => openSheet(null),
    handleEdit: (entry: FoodEntry) => openSheet(entry),
    handleSheetChange,
    handleSaved: () => handleSheetChange(false),
    handleDelete,
  };
};
