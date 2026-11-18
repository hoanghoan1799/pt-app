import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("rate_limits")
// The purge (ExpiredRowsPurge) deletes rows whose window is over.
@Index("rate_limits_window_expiry", ["windowStartedAt"])
export class RateLimit {
  @PrimaryColumn({ type: "text" })
  key!: string;

  @Column({ type: "integer", default: 0 })
  count!: number;

  @Column({ type: "timestamptz" })
  windowStartedAt!: Date;
}
