import {
  Check,
  Column,
  Entity,
  ForeignKey,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import {
  adminKeyId,
  GeneratedId,
  socialKeyCheck,
  userKeyId,
} from "./actor-ids.js";
import { Admin } from "./admin.entity.js";
import { SocialPost } from "./social-post.entity.js";
import { User } from "./user.entity.js";

@Entity("social_reactions")
@Check("social_reactions_reactor_key_format", socialKeyCheck("reactor_key"))
@Index("social_reactions_reactor_key_idx", ["reactorKey"])
@ForeignKey(() => User, ["reactorUserId"], ["id"], {
  name: "fk_social_reactions_reactor_user_id",
  onDelete: "CASCADE",
})
@Index("social_reactions_reactor_user_id_idx", ["reactorUserId"], {
  where: `"reactor_user_id" IS NOT NULL`,
})
@ForeignKey(() => Admin, ["reactorAdminId"], ["id"], {
  name: "fk_social_reactions_reactor_admin_id",
  onDelete: "CASCADE",
})
@Index("social_reactions_reactor_admin_id_idx", ["reactorAdminId"], {
  where: `"reactor_admin_id" IS NOT NULL`,
})
export class SocialReaction {
  @PrimaryColumn({ type: "integer" })
  postId!: number;

  @ManyToOne(() => SocialPost, { onDelete: "CASCADE" })
  @JoinColumn({ name: "post_id" })
  post!: Relation<SocialPost>;

  @PrimaryColumn({ type: "text" })
  reactorKey!: string;

  @Column({ type: "text" })
  emoji!: string;

  @Column({ type: "timestamptz" })
  createdAt!: Date;

  @GeneratedId(userKeyId("reactor_key"))
  reactorUserId!: number | null;

  @GeneratedId(adminKeyId("reactor_key"))
  reactorAdminId!: number | null;
}
