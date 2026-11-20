"use client";

import { GROUP_MEMBER_CAP, GROUP_NAME_MAX_LENGTH } from "@pt/contracts";
import { Camera, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { Input } from "@/components/common/Input";
import { Spinner } from "@/components/common/Spinner";
import {
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  FIELD_ERROR,
  LABEL,
  PAGE_CONTAINER,
} from "@/constants/styles";
import { resizeToAvatarDataUrl } from "@/features/avatar/utils/resize-avatar";
import { MemberPicker } from "@/features/chat-groups/components/MemberPicker";
import {
  createGroupAction,
  setGroupAvatarAction,
} from "@/features/chat-groups/services/group-actions";
import type { GroupCandidates } from "@/features/chat-groups/types/group";
import {
  selectionToIds,
  toggleSelection,
} from "@/features/chat-groups/utils/group-display";
import { useLocalizeMessage } from "@/i18n/use-localize-message";
import { getAdminGroupPath } from "@/utils/routes";

interface CreateGroupFormProps {
  candidates: GroupCandidates;
  // A super admin picks any trainee and PT; a PT only their own trainees.
  isSuperAdmin: boolean;
}

// The create page: name, optional photo, members. A PT creating a group is a
// member too (the server adds them); a super admin is in every group already,
// so neither counts against the cap here beyond the picked people.
export const CreateGroupForm = ({
  candidates,
  isSuperAdmin,
}: CreateGroupFormProps) => {
  const t = useTranslations("chatGroups");
  const router = useRouter();
  const localize = useLocalizeMessage();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // A PT occupies one of the places themselves.
  const max = isSuperAdmin ? GROUP_MEMBER_CAP : GROUP_MEMBER_CAP - 1;

  const pickPhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    try {
      setPhoto(await resizeToAvatarDataUrl(file));
    } catch {
      setPhoto(null);
      toast.error(t("info.photoFailed"));
    }
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const { userIds, ptIds } = selectionToIds(selected);
        const result = await createGroupAction({ name, userIds, ptIds });

        if (result.status === "error") {
          setError(localize(result.message));
          return;
        }
        if (photo) {
          // The group exists already; a failed photo is told, not fatal.
          const saved = await setGroupAvatarAction({
            groupId: result.groupId,
            dataUrl: photo,
          });

          if (saved.status === "error") {
            toast.error(localize(saved.message));
          }
        }
        const skipped = result.results.filter(
          (item) => item.outcome !== "added",
        ).length;

        if (skipped > 0) {
          toast.info(t("create.partial", { count: skipped }));
        } else {
          toast.success(t("create.created"));
        }
        router.push(getAdminGroupPath(result.groupId));
      } catch {
        setError(t("create.failed"));
      }
    });
  };

  return (
    <main
      className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
    >
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={t("create.photo")}
            className="relative shrink-0 rounded-full"
          >
            <Avatar
              name={name || t("inbox.title")}
              src={photo}
              tone="soft"
              className="size-16 text-lg"
            />
            <span
              aria-hidden
              className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border border-line bg-bg text-muted"
            >
              <Camera className="size-3.5" />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              void pickPhoto(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="min-w-0 flex-1">
            <label htmlFor="group-name" className={LABEL}>
              {t("create.name")}
            </label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={GROUP_NAME_MAX_LENGTH}
              placeholder={t("create.namePlaceholder")}
              autoComplete="off"
              enterKeyHint="done"
            />
          </div>
        </div>
        {photo && (
          <button
            type="button"
            onClick={() => setPhoto(null)}
            className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted"
          >
            <X className="size-4" aria-hidden />
            {t("info.photoRemove")}
          </button>
        )}
        <p className="-mt-3 text-xs text-muted">{t("create.nameHint")}</p>
        <section className="space-y-3">
          <h2 className={LABEL}>{t("create.members")}</h2>
          <p className="text-sm text-muted">
            {isSuperAdmin
              ? t("create.membersHintSuper")
              : t("create.membersHintPt")}
          </p>
          <MemberPicker
            trainees={candidates.trainees}
            pts={candidates.pts}
            selected={selected}
            onToggle={(key) =>
              setSelected((current) => toggleSelection(current, key, max))
            }
            max={max}
          />
        </section>
        {error && (
          <p role="alert" className={FIELD_ERROR}>
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className={`${BUTTON_SECONDARY} flex-1`}
          >
            {t("info.cancel")}
          </button>
          <button
            type="submit"
            disabled={isPending || name.trim() === ""}
            aria-busy={isPending}
            className={`${BUTTON_PRIMARY} flex-1`}
          >
            {isPending && <Spinner size="md" />}
            {isPending ? t("create.submitting") : t("create.submit")}
          </button>
        </div>
      </form>
    </main>
  );
};
