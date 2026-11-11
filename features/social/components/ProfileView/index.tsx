import { Dumbbell, MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";

import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CARD } from "@/constants/styles";
import { AliasEditor } from "@/features/contact-aliases/components/AliasEditor";
import { BioEditor } from "@/features/social/components/BioEditor";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { ProfileAvatar } from "@/features/social/components/ProfileAvatar";
import { ProfileMenu } from "@/features/social/components/ProfileMenu";
import { ProfileStats } from "@/features/social/components/ProfileStats";
import { RelationshipButton } from "@/features/social/components/RelationshipButton";
import type { ProfileData } from "@/features/social/services/profile-queries";
import type { TrainingStats } from "@/features/social/services/profile-stats";
import type { PostPage, PostPrivacy } from "@/features/social/types/social";
import type { Relationship } from "@/features/social/utils/friend-rules";

interface ProfileViewProps {
  profile: ProfileData;
  mode: "user" | "admin";
  isOwn: boolean;
  posts: PostPage;
  // Trainee profiles only (admins are default friends, not rows).
  friendCount?: number | null;
  // Viewer is a trainee looking at another trainee: the friend button.
  relationship?: Exclude<Relationship, "self"> | null;
  // The "…" menu: block (trainee viewer, trainee profile) and report.
  canBlock?: boolean;
  canReport?: boolean;
  // Own profile: show the post composer with this starting privacy.
  composerPrivacy?: PostPrivacy | null;
  // Trainee profiles: null when the viewer may not see the stats (locked box).
  stats?: TrainingStats | null;
}

const ROLE_KEYS = {
  trainee: "roleTrainee",
  pt: "rolePt",
  super_admin: "roleSuperAdmin",
} as const;

// Profile card plus the posts the viewer may see.
export const ProfileView = ({
  profile,
  mode,
  isOwn,
  posts,
  friendCount = null,
  relationship = null,
  canBlock = false,
  canReport = false,
  composerPrivacy = null,
  stats = null,
}: ProfileViewProps) => {
  const t = useTranslations("social.profile");

  return (
    <div className="space-y-5">
      <section
        className={`${CARD} flex flex-col gap-3 bg-linear-to-br from-surface from-55% to-accent/10 p-4.5`}
      >
        <div className="flex items-center gap-4">
          <ProfileAvatar
            name={profile.name}
            src={profile.avatarUrl}
            mode={mode}
            isOwn={isOwn}
          />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="flex items-center gap-1.5 text-xl font-bold text-fg">
              <span className="break-words [overflow-wrap:anywhere]">
                {profile.name}
              </span>
              {profile.verified && (
                <VerifiedBadge className="size-5 shrink-0" />
              )}
            </h2>
            {profile.alias && (
              <p className="text-sm text-muted">
                {t("realName", { name: profile.realName })}
              </p>
            )}
            {friendCount !== null && (
              <p className="text-sm text-muted">
                {t("friendCount", { count: friendCount })}
              </p>
            )}
            <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-line bg-bg px-2.5 py-1 text-xs font-semibold text-fg">
              <Dumbbell className="size-3.5 text-accent" aria-hidden />
              {t(ROLE_KEYS[profile.role])}
            </span>
          </div>
        </div>
        {isOwn ? (
          <BioEditor mode={mode} bio={profile.bio} />
        ) : (
          profile.bio && (
            <p className="text-sm break-words whitespace-pre-wrap text-muted">
              {profile.bio}
            </p>
          )
        )}
        {!isOwn && (
          <div className="flex flex-wrap items-center gap-2">
            <AliasEditor
              mode={mode}
              targetKey={`${profile.kind}:${profile.id}`}
              realName={profile.realName}
              alias={profile.alias}
            />
            {relationship && (
              <RelationshipButton
                userId={profile.id}
                name={profile.name}
                relationship={relationship}
              />
            )}
            {profile.kind === "user" && (canBlock || canReport) && (
              <ProfileMenu
                mode={mode}
                userId={profile.id}
                name={profile.name}
                canBlock={canBlock}
                canReport={canReport}
              />
            )}
          </div>
        )}
      </section>
      {profile.kind === "user" && <ProfileStats stats={stats} />}
      <section className="space-y-3" aria-labelledby="profile-posts-title">
        <h2
          id="profile-posts-title"
          className="flex items-center gap-2 text-lg font-bold text-fg"
        >
          <MessageSquare className="size-5 text-accent" aria-hidden />
          {t("posts")}
        </h2>
        {isOwn && composerPrivacy && (
          <PostComposer
            mode={mode}
            defaultPrivacy={composerPrivacy}
            viewerName={profile.realName}
            viewerAvatarUrl={profile.avatarUrl}
          />
        )}
        <PostList
          mode={mode}
          source={{ type: "profile", kind: profile.kind, id: profile.id }}
          initial={posts}
          emptyText={t("noPosts")}
        />
      </section>
    </div>
  );
};
