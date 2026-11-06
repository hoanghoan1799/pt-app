"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ROUTES } from "@/constants/routes";
import { db } from "@/db";
import {
  bodyProfiles,
  chatConversations,
  chatMessageEdits,
  chatMessages,
  chatReactions,
  chatReads,
  exerciseCompletions,
  exercises,
  exerciseSets,
  foodEntries,
  mealPlanDays,
  nutritionTargets,
  pushSubscriptions,
  users,
  weightLogs,
  workoutDays,
} from "@/db/schema";
import { userOwnerKey } from "@/features/chat/utils/push-rules";
import { deleteDays } from "@/features/meal-plans/services/meal-plan-store";
import { createMemberWithLogin } from "@/features/members/services/create-member-with-login";
import {
  withFormErrorHandling,
  withResultErrorHandling,
} from "@/services/action-errors";
import { requireAdmin } from "@/services/auth-guard";
import type { FormState } from "@/types/form";
import { createErrorState, createSuccessState } from "@/utils/form";

export const createMemberAction = withFormErrorHandling(
  "createMember",
  async (_previousState: FormState, formData: FormData): Promise<FormState> => {
    await requireAdmin();

    const rawName = String(formData.get("name") ?? "");
    const rawEmail = String(formData.get("email") ?? "");
    const result = await createMemberWithLogin(rawName, rawEmail);

    if (result.status === "error") {
      return createErrorState(result.message, {
        fieldErrors: { [result.field]: result.message },
        values: { name: rawName, email: rawEmail },
      });
    }

    revalidatePath(ROUTES.ADMIN);
    // The password goes back to the caller once and is never logged.
    return {
      ...createSuccessState(`Đã thêm ${result.name}`),
      credentials: {
        name: result.name,
        email: rawEmail.trim(),
        password: result.password,
      },
    };
  },
);

export const deleteMemberAction = withResultErrorHandling(
  "deleteMember",
  async (userId: number) => {
    await requireAdmin();

    const id = z.number().int().positive().parse(userId);
    const days = await db
      .select({ id: workoutDays.id })
      .from(workoutDays)
      .where(eq(workoutDays.userId, id));
    const dayIds = days.map((day) => day.id);
    const planDays = await db
      .select({ id: mealPlanDays.id })
      .from(mealPlanDays)
      .where(eq(mealPlanDays.userId, id));

    const conversations = await db
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(eq(chatConversations.userId, id));
    const conversationIds = conversations.map((row) => row.id);

    await db.transaction(async (tx) => {
      // Children first: foreign keys are not enforced (D10).
      if (conversationIds.length) {
        await tx
          .delete(chatReads)
          .where(inArray(chatReads.conversationId, conversationIds));
        const messageIds = tx
          .select({ id: chatMessages.id })
          .from(chatMessages)
          .where(inArray(chatMessages.conversationId, conversationIds));

        await tx
          .delete(chatReactions)
          .where(inArray(chatReactions.messageId, messageIds));
        await tx
          .delete(chatMessageEdits)
          .where(inArray(chatMessageEdits.messageId, messageIds));
        await tx
          .delete(chatMessages)
          .where(inArray(chatMessages.conversationId, conversationIds));
      }
      await tx
        .delete(chatConversations)
        .where(eq(chatConversations.userId, id));
      await tx
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.ownerKey, userOwnerKey(id)));
      await tx.delete(exerciseSets).where(eq(exerciseSets.userId, id));
      await tx
        .delete(exerciseCompletions)
        .where(eq(exerciseCompletions.userId, id));
      await tx.delete(foodEntries).where(eq(foodEntries.userId, id));
      await tx.delete(nutritionTargets).where(eq(nutritionTargets.userId, id));
      await tx.delete(bodyProfiles).where(eq(bodyProfiles.userId, id));
      await tx.delete(weightLogs).where(eq(weightLogs.userId, id));
      await deleteDays(
        planDays.map((day) => day.id),
        tx,
      );

      if (dayIds.length) {
        await tx.delete(exercises).where(inArray(exercises.dayId, dayIds));
        await tx.delete(workoutDays).where(inArray(workoutDays.id, dayIds));
      }
      await tx.delete(users).where(eq(users.id, id));
    });

    revalidatePath(ROUTES.ADMIN);
    redirect(ROUTES.ADMIN);
  },
);
