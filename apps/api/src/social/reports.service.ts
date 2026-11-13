import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import type {
  SocialReportRequest,
  SocialReportTargetKind,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { AccountDirectory } from "../users/account-directory.service.js";
import { EngagementService } from "./engagement.service.js";
import {
  deletedAccountName,
  postImageOnlyText,
  previewText,
} from "./notifications/notification-content.js";
import { PostAccess } from "./post-access.service.js";
import { PostsService } from "./posts.service.js";
import { RelationshipQueries } from "./relationships.queries.js";
import { notAllowed, reportNotFound, userNotFound } from "./social.errors.js";
import { keyOf, type SocialActor } from "./social-actor.js";

const PREVIEW_LENGTH = 140;

export type ReportView = {
  id: number;
  targetKind: SocialReportTargetKind;
  targetId: number;
  reporterName: string;
  reason: string;
  createdAt: Date;
  preview: string | null;
  targetName: string | null;
  postId: number | null;
};

type ReportRow = {
  id: number;
  reporter_key: string;
  target_kind: SocialReportTargetKind;
  target_id: number;
  reason: string;
  created_at: Date;
};

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly access: PostAccess,
    private readonly accounts: AccountDirectory,
    private readonly relationships: RelationshipQueries,
    private readonly posts: PostsService,
    private readonly engagement: EngagementService,
    private readonly clock: Clock,
  ) {}

  // Can this actor see (and so report) the target? Never your own content.
  private async canReport(
    actor: SocialActor,
    kind: SocialReportTargetKind,
    targetId: number,
  ): Promise<boolean> {
    const mine = keyOf(actor);

    if (kind === "post") {
      const post = await this.access.loadVisiblePost(actor, targetId);

      return Boolean(post) && `${post?.authorKind}:${post?.authorId}` !== mine;
    }
    if (kind === "comment") {
      const rows: { post_id: number; author_key: string }[] =
        await this.dataSource.query(
          `SELECT post_id, author_key FROM social_comments
           WHERE id = $1 AND deleted_at IS NULL`,
          [targetId],
        );
      const comment = rows[0];

      return (
        Boolean(comment) &&
        comment.author_key !== mine &&
        Boolean(await this.access.loadVisiblePost(actor, comment.post_id))
      );
    }
    const target: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM users WHERE id = $1`,
      [targetId],
    );

    if (
      target.length === 0 ||
      (actor.kind === "user" && actor.id === targetId)
    ) {
      return false;
    }
    if (actor.kind === "user") {
      return !(await this.relationships.isBlockedBetween(actor.id, targetId));
    }
    return this.access.adminCanAccessUser(actor, targetId);
  }

  // Files a report; an open report by the same person on the same target is
  // kept as it is (no duplicates, no error).
  async create(actor: SocialActor, input: SocialReportRequest) {
    if (!(await this.canReport(actor, input.targetKind, input.targetId))) {
      throw userNotFound();
    }
    const reporterKey = keyOf(actor);
    const existing: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM social_reports
       WHERE reporter_key = $1 AND target_kind = $2 AND target_id = $3
         AND status = 'open' LIMIT 1`,
      [reporterKey, input.targetKind, input.targetId],
    );

    if (existing.length === 0) {
      await this.dataSource.query(
        `INSERT INTO social_reports (reporter_key, target_kind, target_id, reason, status, created_at)
         VALUES ($1, $2, $3, $4, 'open', $5)`,
        [
          reporterKey,
          input.targetKind,
          input.targetId,
          input.reason.trim(),
          this.clock.now(),
        ],
      );
    }
  }

  // Super admin only (A14). "kept" leaves the content alone; "deleted" removes
  // the post or comment (a user target has nothing to delete and is just closed
  // as kept). Every open report on the same target is closed with it.
  async resolve(
    actor: SocialActor,
    reportId: number,
    resolution: "kept" | "deleted",
  ) {
    if (actor.kind !== "admin" || actor.role !== "super_admin") {
      throw notAllowed();
    }
    const rows: { target_kind: SocialReportTargetKind; target_id: number }[] =
      await this.dataSource.query(
        `SELECT target_kind, target_id FROM social_reports
         WHERE id = $1 AND status = 'open'`,
        [reportId],
      );
    const report = rows[0];

    if (!report) {
      throw reportNotFound();
    }
    let applied = resolution;

    if (report.target_kind === "user") {
      applied = "kept";
    } else if (resolution === "deleted") {
      // Already gone counts as done.
      if (report.target_kind === "post") {
        if (await this.access.findLivePost(report.target_id)) {
          await this.posts.deleteInTransaction(report.target_id);
        }
      } else {
        const live: unknown[] = await this.dataSource.query(
          `SELECT 1 FROM social_comments WHERE id = $1 AND deleted_at IS NULL`,
          [report.target_id],
        );

        if (live.length > 0) {
          await this.engagement.tombstone(report.target_id);
        }
      }
    }
    await this.dataSource.query(
      `UPDATE social_reports
       SET status = 'resolved', resolution = $3, resolved_by = $4, resolved_at = $5
       WHERE target_kind = $1 AND target_id = $2 AND status = 'open'`,
      [
        report.target_kind,
        report.target_id,
        applied,
        actor.id,
        this.clock.now(),
      ],
    );
  }

  private snippet(text: string | null, fallback: string) {
    const flat = (text ?? "").replace(/\s+/g, " ").trim();

    return flat === "" ? fallback : previewText(flat, PREVIEW_LENGTH);
  }

  // Open reports, oldest first, each with a preview of what was reported.
  async listOpen(actor: SocialActor): Promise<ReportView[]> {
    const locale = actor.locale ?? "vi";
    const reports: ReportRow[] = await this.dataSource.query(
      `SELECT id, reporter_key, target_kind, target_id, reason, created_at
       FROM social_reports WHERE status = 'open' ORDER BY created_at, id`,
    );
    const idsOf = (kind: SocialReportTargetKind) =>
      reports.filter((r) => r.target_kind === kind).map((r) => r.target_id);
    const [posts, comments, targetUsers]: [
      {
        id: number;
        author_kind: string;
        author_id: number;
        caption: string | null;
        deleted_at: Date | null;
      }[],
      {
        id: number;
        post_id: number;
        author_key: string;
        body: string;
        deleted_at: Date | null;
      }[],
      { id: number; name: string }[],
    ] = await Promise.all([
      this.dataSource.query(
        `SELECT id, author_kind, author_id, caption, deleted_at FROM social_posts
         WHERE id = ANY($1::int[])`,
        [idsOf("post")],
      ),
      this.dataSource.query(
        `SELECT id, post_id, author_key, body, deleted_at FROM social_comments
         WHERE id = ANY($1::int[])`,
        [idsOf("comment")],
      ),
      this.dataSource.query(
        `SELECT id, name FROM users WHERE id = ANY($1::int[])`,
        [idsOf("user")],
      ),
    ]);
    const accounts = await this.accounts.loadAccounts([
      ...reports.map((r) => r.reporter_key),
      ...posts.map((p) => `${p.author_kind}:${p.author_id}`),
      ...comments.map((c) => c.author_key),
    ]);
    const nameOf = (key: string) =>
      accounts.get(key)?.name ?? deletedAccountName(locale);

    return reports.map((report): ReportView => {
      const base = {
        id: report.id,
        targetKind: report.target_kind,
        targetId: report.target_id,
        reporterName: nameOf(report.reporter_key),
        reason: report.reason,
        createdAt: report.created_at,
      };
      const gone = { ...base, preview: null, targetName: null, postId: null };

      if (report.target_kind === "post") {
        const post = posts.find((p) => p.id === report.target_id);

        return post && post.deleted_at === null
          ? {
              ...base,
              preview: this.snippet(post.caption, postImageOnlyText(locale)),
              targetName: nameOf(`${post.author_kind}:${post.author_id}`),
              postId: post.id,
            }
          : gone;
      }
      if (report.target_kind === "comment") {
        const comment = comments.find((c) => c.id === report.target_id);

        return comment && comment.deleted_at === null
          ? {
              ...base,
              preview: this.snippet(comment.body, ""),
              targetName: nameOf(comment.author_key),
              postId: comment.post_id,
            }
          : gone;
      }
      const target = targetUsers.find((u) => u.id === report.target_id);

      return target
        ? { ...base, preview: null, targetName: target.name, postId: null }
        : gone;
    });
  }
}
