import { Avatar } from "@/components/common/Avatar";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import { CARD, SECTION_TITLE } from "@/constants/styles";
import { BioEditor } from "@/features/social/components/BioEditor";
import { PostList } from "@/features/social/components/PostList";
import type { ProfileData } from "@/features/social/services/profile-queries";
import type { PostPage } from "@/features/social/types/social";

interface ProfileViewProps {
  profile: ProfileData;
  mode: "user" | "admin";
  isOwn: boolean;
  posts: PostPage;
}

// Profile card plus the posts the viewer may see. The friend count joins the
// card in P4.
export const ProfileView = ({
  profile,
  mode,
  isOwn,
  posts,
}: ProfileViewProps) => (
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
      {isOwn ? (
        <BioEditor mode={mode} bio={profile.bio} />
      ) : (
        profile.bio && (
          <p className="text-sm break-words whitespace-pre-wrap text-muted">
            {profile.bio}
          </p>
        )
      )}
    </section>
    <section className="space-y-3" aria-labelledby="profile-posts-title">
      <h2 id="profile-posts-title" className={SECTION_TITLE}>
        Bài viết
      </h2>
      <PostList
        mode={mode}
        source={{ type: "profile", kind: profile.kind, id: profile.id }}
        initial={posts}
        emptyText="Chưa có bài viết nào."
      />
    </section>
  </div>
);
