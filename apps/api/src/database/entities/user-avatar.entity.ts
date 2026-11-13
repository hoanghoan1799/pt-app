import {
  Check,
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  type Relation,
} from "typeorm";

import { User } from "./user.entity.js";

// The profile photo of one user, kept out of the hot `users` table. The
// version used in the URL stays in `users.avatar_updated_at`; `updated_at`
// here is the same instant, written together with the bytes.
@Entity("user_avatars")
@Check("user_avatars_size_matches_data", `"size" = octet_length("data")`)
@Check(`"mime" IN ('image/webp', 'image/jpeg', 'image/png')`)
export class UserAvatar {
  @PrimaryColumn({ type: "integer" })
  userId!: number;

  @OneToOne(() => User, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user!: Relation<User>;

  @Column({ type: "text" })
  mime!: "image/webp" | "image/jpeg" | "image/png";

  @Column({ type: "bytea" })
  data!: Buffer;

  @Column({ type: "integer" })
  size!: number;

  @Column({ type: "timestamptz" })
  updatedAt!: Date;
}
