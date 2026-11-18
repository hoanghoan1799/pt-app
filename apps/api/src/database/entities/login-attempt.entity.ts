import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("login_attempts")
// The purge (ExpiredRowsPurge) looks for expired locks and for unlocked rows
// whose failure window is over.
@Index("login_attempts_lock_expiry", ["lockedUntil"], {
  where: `"locked_until" IS NOT NULL`,
})
@Index("login_attempts_window_expiry", ["windowStartedAt"], {
  where: `"locked_until" IS NULL`,
})
export class LoginAttempt {
  @PrimaryColumn({ type: "text" })
  key!: string;

  @Column({ type: "integer", default: 0 })
  failedCount!: number;

  @Column({ type: "timestamptz" })
  windowStartedAt!: Date;

  @Column({ type: "timestamptz", nullable: true })
  lockedUntil!: Date | null;
}
