"use client";

import {
  GROUP_MEMBER_CAP,
  GROUP_NAME_MAX_LENGTH,
  type GroupMemberView,
  type GroupRole,
} from "@pt/contracts";
import { Camera, Plus, Trash2, UserMinus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Avatar } from "@/components/common/Avatar";
import { BottomSheet } from "@/components/common/BottomSheet";
import { useConfirm } from "@/components/common/ConfirmDialog/use-confirm";
import { Input } from "@/components/common/Input";
import { Spinner } from "@/components/common/Spinner";
import { ROUTES } from "@/constants/routes";
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  FIELD_ERROR,
  PAGE_CONTAINER,
  SECTION_TITLE,
} from "@/constants/styles";
import { resizeToAvatarDataUrl } from "@/features/avatar/utils/resize-avatar";
import { GroupSwitchRow } from "@/features/chat-groups/components/GroupSwitchRow";
import { MemberPicker } from "@/features/chat-groups/components/MemberPicker";
import { useGroupLiveRefresh } from "@/features/chat-groups/hooks/use-group-live-refresh";
import { useSyncedState } from "@/features/chat-groups/hooks/use-synced-state";
import {
  addGroupMembersAction,
  adminLeaveGroupAction,
  adminSetGroupMutedAction,
  dissolveGroupAction,
  removeGroupMemberAction,
  renameGroupAction,
  setGroupAvatarAction,
  setGroupManagersOnlyAction,
} from "@/features/chat-groups/services/group-actions";
import type { GroupCandidates } from "@/features/chat-groups/types/group";
import {
  selectionToIds,
  toggleSelection,
} from "@/features/chat-groups/utils/group-display";
import { useLocalizeMessage } from "@/i18n/use-localize-message";

interface GroupInfoProps {
  group: {
    id: number;
    name: string;
    // Signed group photo URL (this app's route), or null for initials.
    avatarUrl: string | null;
    managersOnly: boolean;
    dissolved: boolean;
  };
  members: GroupMemberView[];
  // Who the add sheet offers (empty when the viewer cannot manage).
  candidates: GroupCandidates;
  // "admin:<id>" of the viewer, to mark their own row.
  viewerKey: string;
  // Super admin or the creator PT.
  canManage: boolean;
  isSuperAdmin: boolean;
  initialMuted: boolean;
}

const ROLE_KEY = {
  super_admin: "role.manager",
  pt: "role.pt",
  trainee: "role.trainee",
} as const satisfies Record<GroupRole, string>;

// The group info page for admins: members with their label, add and remove,
// rename, photo and the managers-only switch for whoever can manage, mute and
// leave for everyone but super admins, dissolve for super admins.
export const GroupInfo = ({
  group,
  members,
  candidates,
  viewerKey,
  canManage,
  isSuperAdmin,
  initialMuted,
}: GroupInfoProps) => {
  const t = useTranslations("chatGroups");
  const router = useRouter();
  const confirm = useConfirm();
  const localize = useLocalizeMessage();
  const fileInput = useRef<HTMLInputElement>(null);
  // Another manager's change refreshes the page; the fields follow it.
  const [name, setName] = useSyncedState(group.name);
  const [managersOnly, setManagersOnly] = useSyncedState(group.managersOnly);
  const [muted, setMuted] = useSyncedState(initialMuted);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const explicitCount = members.filter(
    (member) => member.role !== "super_admin",
  ).length;
  const room = Math.max(0, GROUP_MEMBER_CAP - explicitCount);
  const isReadOnly = group.dissolved;
  const canEdit = canManage && !isReadOnly;
  const avatarSrc = group.avatarUrl;

  useGroupLiveRefresh("admin", group.id);

  // Runs one action: `busy` names what is running (spinner on that control,
  // every other control waits), a failure shows its localized message,
  // success refreshes the page data.
  const run = (
    id: string,
    action: () => Promise<{ status: string; message?: string }>,
    {
      success,
      failure,
      onDone,
      onFail,
    }: {
      success?: string;
      failure: string;
      onDone?: () => void;
      // Undoes an optimistic change when the action did not go through.
      onFail?: () => void;
    },
  ) => {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();

        if (result.status === "success") {
          if (success) {
            toast.success(success);
          }
          // Leave and dissolve navigate away instead: refreshing this page
          // first would render its 404 (no longer a member).
          if (onDone) {
            onDone();
          } else {
            router.refresh();
          }
        } else {
          onFail?.();
          setError(result.message ? localize(result.message) : failure);
        }
      } catch {
        onFail?.();
        setError(failure);
      } finally {
        setBusy(null);
      }
    });
  };

  const pickPhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }
    let dataUrl: string;

    try {
      dataUrl = await resizeToAvatarDataUrl(file);
    } catch {
      setError(t("info.photoFailed"));
      return;
    }
    run("photo", () => setGroupAvatarAction({ groupId: group.id, dataUrl }), {
      success: t("info.photoSaved"),
      failure: t("info.photoFailed"),
    });
  };

  const removeMember = async (member: GroupMemberView) => {
    const isConfirmed = await confirm({
      title: t("info.removeTitle", { name: member.name }),
      description: t("info.removeDescription", { name: member.name }),
      confirmLabel: t("info.removeAction"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    run(
      `remove:${member.key}`,
      () =>
        removeGroupMemberAction({ groupId: group.id, memberKey: member.key }),
      { failure: t("info.removeFailed") },
    );
  };

  const addMembers = () => {
    const { userIds, ptIds } = selectionToIds(selected);

    setBusy("add");
    setError(null);
    startTransition(async () => {
      try {
        const result = await addGroupMembersAction({
          groupId: group.id,
          userIds,
          ptIds,
        });

        if (result.status === "error") {
          setError(localize(result.message));
          return;
        }
        const added = result.results.filter(
          (item) => item.outcome === "added",
        ).length;
        const skipped = result.results.length - added;

        // Nobody added (all taken meanwhile or out of scope) is no success.
        if (added > 0) {
          toast.success(t("info.added", { count: added }));
        }
        if (skipped > 0) {
          toast.info(t("info.addSkipped", { count: skipped }));
        }
        setSelected(new Set());
        setIsAddOpen(false);
        router.refresh();
      } catch {
        setError(t("info.failed"));
      } finally {
        setBusy(null);
      }
    });
  };

  const leave = async () => {
    const isConfirmed = await confirm({
      title: t("info.leaveTitle"),
      description: t("info.leaveDescription"),
      confirmLabel: t("info.leave"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    run("leave", () => adminLeaveGroupAction({ groupId: group.id }), {
      failure: t("info.leaveFailed"),
      onDone: () => router.replace(ROUTES.ADMIN_MESSAGES),
    });
  };

  const dissolve = async () => {
    const isConfirmed = await confirm({
      title: t("info.dissolveTitle"),
      description: t("info.dissolveDescription"),
      confirmLabel: t("info.dissolve"),
      isDanger: true,
    });

    if (!isConfirmed) {
      return;
    }
    run("dissolve", () => dissolveGroupAction({ groupId: group.id }), {
      failure: t("info.dissolveFailed"),
      onDone: () => router.replace(ROUTES.ADMIN_MESSAGES),
    });
  };

  return (
    <main
      className={`${PAGE_CONTAINER} space-y-6 pt-4 pb-[calc(env(safe-area-inset-bottom)+2rem)]`}
    >
      <section className="flex flex-col items-center gap-3 text-center">
        <Avatar
          name={group.name}
          src={avatarSrc}
          tone="soft"
          className="size-24 text-3xl"
        />
        <h2 className="text-xl font-bold text-fg">{group.name}</h2>
        {isReadOnly && (
          <p role="status" className="text-sm text-muted">
            {t("info.dissolvedNote")}
          </p>
        )}
        {canEdit && (
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              aria-busy={busy === "photo"}
              onClick={() => fileInput.current?.click()}
              className={`${BUTTON_SECONDARY} min-h-11 px-4 text-sm`}
            >
              {busy === "photo" ? (
                <Spinner size="sm" />
              ) : (
                <Camera className="size-4" aria-hidden />
              )}
              {t("info.photoChange")}
            </button>
            {avatarSrc && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() =>
                  run(
                    "photo",
                    () =>
                      setGroupAvatarAction({
                        groupId: group.id,
                        dataUrl: null,
                      }),
                    { failure: t("info.photoFailed") },
                  )
                }
                className={`${BUTTON_SECONDARY} min-h-11 px-4 text-sm`}
              >
                {t("info.photoRemove")}
              </button>
            )}
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
          </div>
        )}
      </section>

      {error && (
        <p role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}

      {canEdit && (
        <section className="space-y-3">
          <h2 className={SECTION_TITLE}>{t("info.manageSection")}</h2>
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                "rename",
                () => renameGroupAction({ groupId: group.id, name }),
                {
                  success: t("info.renameSaved"),
                  failure: t("info.failed"),
                },
              );
            }}
          >
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={GROUP_NAME_MAX_LENGTH}
              aria-label={t("info.rename")}
              wrapperClassName="min-w-0 flex-1"
              autoComplete="off"
              enterKeyHint="done"
            />
            <button
              type="submit"
              disabled={
                busy !== null ||
                name.trim() === "" ||
                name.trim() === group.name
              }
              aria-busy={busy === "rename"}
              className={`${BUTTON_PRIMARY} shrink-0 px-4`}
            >
              {busy === "rename" && <Spinner size="sm" />}
              {t("info.renameSave")}
            </button>
          </form>
          <GroupSwitchRow
            label={t("info.managersOnly")}
            hint={t("info.managersOnlyHint")}
            checked={managersOnly}
            isPending={busy === "managersOnly"}
            isDisabled={busy !== null}
            onChange={(next) => {
              setManagersOnly(next);
              run(
                "managersOnly",
                () =>
                  setGroupManagersOnlyAction({
                    groupId: group.id,
                    enabled: next,
                  }),
                {
                  failure: t("info.failed"),
                  onFail: () => setManagersOnly(!next),
                },
              );
            }}
          />
        </section>
      )}
      {!canManage && !isReadOnly && (
        <p className="text-sm text-muted">{t("info.readOnly")}</p>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className={SECTION_TITLE}>
            {t("info.members", { count: members.length })}
          </h2>
          {canEdit && (
            <button
              type="button"
              disabled={room === 0}
              onClick={() => setIsAddOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-accent transition active:bg-line disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden />
              {t("info.add")}
            </button>
          )}
        </div>
        <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
          {members.map((member) => {
            const isSelf = member.key === viewerKey;
            const canRemove =
              canEdit && member.role !== "super_admin" && !isSelf;

            return (
              <li
                key={member.key}
                className="flex min-h-14 items-center gap-3 px-4 py-2"
              >
                <Avatar
                  name={member.name}
                  tone="soft"
                  className="size-9 text-xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-fg">
                    {member.name}
                    {isSelf && (
                      <span className="ml-1.5 text-xs font-normal text-muted">
                        ({t("info.you")})
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-muted">
                    {t(ROLE_KEY[member.role])}
                    {member.isCreator && ` · ${t("info.creator")}`}
                  </span>
                </span>
                {canRemove && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    aria-busy={busy === `remove:${member.key}`}
                    aria-label={t("info.removeTitle", { name: member.name })}
                    onClick={() => void removeMember(member)}
                    className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-muted transition active:bg-line disabled:opacity-40"
                  >
                    {busy === `remove:${member.key}` ? (
                      <Spinner size="sm" />
                    ) : (
                      <UserMinus className="size-5" aria-hidden />
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!isReadOnly && (
        <section className="space-y-2">
          <h2 className={SECTION_TITLE}>{t("info.notificationsSection")}</h2>
          <GroupSwitchRow
            label={t("info.mute")}
            hint={t("info.muteHint")}
            checked={muted}
            isPending={busy === "mute"}
            isDisabled={busy !== null}
            onChange={(next) => {
              setMuted(next);
              run(
                "mute",
                () =>
                  adminSetGroupMutedAction({ groupId: group.id, muted: next }),
                {
                  failure: t("info.failed"),
                  onFail: () => setMuted(!next),
                },
              );
            }}
          />
        </section>
      )}

      {!isReadOnly && (
        <section className="space-y-3">
          {isSuperAdmin ? (
            <>
              <p className="text-sm text-muted">{t("info.managerStays")}</p>
              <button
                type="button"
                disabled={busy !== null}
                aria-busy={busy === "dissolve"}
                onClick={() => void dissolve()}
                className={`${BUTTON_DANGER} w-full`}
              >
                {busy === "dissolve" ? (
                  <Spinner size="sm" />
                ) : (
                  <Trash2 className="size-4" aria-hidden />
                )}
                {t("info.dissolve")}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              aria-busy={busy === "leave"}
              onClick={() => void leave()}
              className={`${BUTTON_DANGER} w-full`}
            >
              {busy === "leave" && <Spinner size="sm" />}
              {t("info.leave")}
            </button>
          )}
        </section>
      )}

      <BottomSheet
        isOpen={isAddOpen}
        onOpenChange={setIsAddOpen}
        title={t("info.add")}
        description={t("info.addDescription")}
      >
        <div className="max-h-[60dvh] overflow-y-auto pb-3">
          <MemberPicker
            trainees={candidates.trainees}
            pts={candidates.pts}
            selected={selected}
            onToggle={(key) =>
              setSelected((current) => toggleSelection(current, key, room))
            }
            max={room}
          />
        </div>
        <button
          type="button"
          disabled={selected.size === 0 || busy === "add"}
          aria-busy={busy === "add"}
          onClick={addMembers}
          className={`${BUTTON_PRIMARY} mt-2 w-full`}
        >
          {busy === "add" && <Spinner size="sm" />}
          {t("info.addSubmit", { count: selected.size })}
        </button>
      </BottomSheet>
    </main>
  );
};
