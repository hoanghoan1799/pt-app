import { useTranslations } from "next-intl";

import { Avatar } from "@/components/common/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import { AliasEditor } from "@/features/contact-aliases/components/AliasEditor";
import { BioEditor } from "@/features/social/components/BioEditor";
import { PostComposer } from "@/features/social/components/PostComposer";
import { PostList } from "@/features/social/components/PostList";
import { ProfileMenu } from "@/features/social/components/ProfileMenu";
import { RelationshipButton } from "@/features/social/components/RelationshipButton";
import type { ProfileData } from "@/features/social/services/profile-queries";
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
}

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
}: ProfileViewProps) => {
  const t = useTranslations("social.profile");

  return (
    <div className="space-y-6">
      <section
        className={`${CARD} flex flex-col items-center gap-3 p-5 text-center`}
      >
        <Avatar
          name={profile.name}
          src={profile.avatarUrl}
          className="size-24 text-3xl"
        />
        <h2 className="flex items-center gap-1.5 text-xl font-bold text-fg">
          <span className="break-words">{profile.name}</span>
          {profile.verified && <VerifiedBadge className="size-5" />}
        </h2>
        {profile.alias && (
          <p className="-mt-2 text-sm text-muted">
            {t("realName", { name: profile.realName })}
          </p>
        )}
        {friendCount !== null && (
          <p className="text-sm font-medium text-muted">
            {t("friendCount", { count: friendCount })}
          </p>
        )}
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
          <div className="flex items-center gap-2">
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
      <section className="space-y-3" aria-labelledby="profile-posts-title">
        <h2 id="profile-posts-title" className={SECTION_TITLE}>
          {t("posts")}
        </h2>
        {isOwn && composerPrivacy && (
          <PostComposer mode={mode} defaultPrivacy={composerPrivacy} />
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
