import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("login_attempts")
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
