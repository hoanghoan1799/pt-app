"use client";

import { Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { BottomSheet } from "@/components/common/BottomSheet";
import { IconButton } from "@/components/common/IconButton";
import { AliasField } from "@/features/contact-aliases/components/AliasField";
import {
  adminSetContactAliasAction,
  setContactAliasAction,
} from "@/features/contact-aliases/services/contact-alias-actions";
import { cn } from "@/utils/cn";

interface AliasEditorProps {
  // Whose account is looking: picks the action (requireUser / requireAdmin).
  mode: "user" | "admin";
  // "user:<id>" / "admin:<id>" of the person being named.
  targetKey: string;
  realName: string;
  // The current private nickname, "" when none.
  alias: string;
  className?: string;
}

// "Đặt biệt danh" on someone else's profile: a button that opens the same
// editor the chat settings use. Only the signed-in person sees the result.
export const AliasEditor = ({
  mode,
  targetKey,
  realName,
  alias,
  className,
}: AliasEditorProps) => {
  const t = useTranslations("common.alias");
  const [isOpen, setOpen] = useState(false);
  const [saved, setSaved] = useState(alias);

  const save = async (target: string, value: string) => {
    try {
      const result = await (
        mode === "admin" ? adminSetContactAliasAction : setContactAliasAction
      )({ targetKey: target, alias: value });

      if (result.status !== "success") {
        return result.message ?? t("failed");
      }
      setSaved(result.alias);
      setOpen(false);
      return null;
    } catch {
      return t("failed");
    }
  };

  return (
    <>
      <IconButton
        label={saved ? t("editAlias") : t("setAlias")}
        size="lg"
        onClick={() => setOpen(true)}
        className={cn("border border-line", className)}
      >
        <Tag className="size-5" aria-hidden />
      </IconButton>
      <BottomSheet
        isOpen={isOpen}
        onOpenChange={setOpen}
        title={t("sheetTitle", { name: realName })}
      >
        <div>
          <AliasField
            key={saved}
            id="profile-alias"
            label={t("fieldLabel", { name: realName })}
            targetKey={targetKey}
            realName={realName}
            saved={saved || undefined}
            onSave={save}
          />
        </div>
      </BottomSheet>
    </>
  );
};
