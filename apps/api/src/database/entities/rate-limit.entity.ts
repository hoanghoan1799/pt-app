import { Column, Entity, PrimaryColumn } from "typeorm";

@Entity("rate_limits")
export class RateLimit {
  @PrimaryColumn({ type: "text" })
  key!: string;

  @Column({ type: "integer", default: 0 })
  count!: number;

  @Column({ type: "timestamptz" })
  windowStartedAt!: Date;
}
