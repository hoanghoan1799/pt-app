import { Injectable } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import {
  type SocialPostPrivacy,
  type SocialRelationship,
  WORKOUT_TIME_ZONE,
} from "@pt/contracts";
import { DataSource } from "typeorm";

import { Clock } from "../common/clock.js";
import { getTodayDate } from "../workouts/domain/week.js";
import { type ProfileRow, SocialAccountQueries } from "./accounts.queries.js";
import { canViewTrainingStats, computeDayStreak } from "./domain/streak.js";
import { PostAccess } from "./post-access.service.js";
import { RelationshipQueries } from "./relationships.queries.js";
import { profileNotFound } from "./social.errors.js";
import { type AuthorRef, keyOf, type SocialActor } from "./social-actor.js";

export type ProfileView = ProfileRow & {
  realName: string;
  alias: string;
  isOwn: boolean;
  relationship: SocialRelationship | null;
  friendCount: number | null;
  stats: { workouts: number; streak: number; totalSets: number } | null;
  canBlock: boolean;
  canReport: boolean;
  composerPrivacy: SocialPostPrivacy | null;
};

// Profile card data: who the person is, how the viewer relates to them, and
// the stats the viewer may see.
@Injectable()
export class ProfilesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly accounts: SocialAccountQueries,
    private readonly relationships: RelationshipQueries,
    private readonly access: PostAccess,
    private readonly clock: Clock,
  ) {}

  // Throws "not found" for a missing account, a trainee blocked either way, and
  // (for admins) a trainee outside their workspace or hidden. Used by the
  // profile card and by the profile's post list.
  async assertViewable(viewer: SocialActor, target: AuthorRef) {
    const profile = await this.accounts.findProfile(target);

    if (!profile) {
      throw profileNotFound();
    }
    if (target.kind === "user") {
      if (viewer.kind === "admin") {
        if (!(await this.access.adminCanAccessUser(viewer, target.id))) {
          throw profileNotFound();
        }
      } else if (
        viewer.id !== target.id &&
        (await this.relationships.isBlockedBetween(viewer.id, target.id))
      ) {
        throw profileNotFound();
      }
    }
    return profile;
  }

  async get(viewer: SocialActor, target: AuthorRef): Promise<ProfileView> {
    const profile = await this.assertViewable(viewer, target);
    const isTrainee = target.kind === "user";
    const isOwn = keyOf(viewer) === keyOf(target);
    // The viewer's private nickname replaces the name, never on their own.
    const alias = isOwn
      ? ""
      : ((await this.accounts.loadAliases(keyOf(viewer), [keyOf(target)])).get(
          keyOf(target),
        ) ?? "");
    const relationship =
      viewer.kind === "user" && isTrainee && !isOwn
        ? ((await this.relationships.relationship(
            viewer.id,
            target.id,
          )) as SocialRelationship)
        : null;
    const showStats =
      isTrainee &&
      canViewTrainingStats({
        isOwn,
        isAdminViewer: viewer.kind === "admin",
        relationship,
      });
    const [friendCount, stats, composerPrivacy] = await Promise.all([
      isTrainee ? this.relationships.friendIds(target.id).then((ids) => ids.length) : null,
      showStats ? this.trainingStats(target.id) : null,
      isOwn
        ? viewer.kind === "user"
          ? this.accounts.postPrivacyDefault(viewer.id)
          : ("everyone" as const)
        : null,
    ]);

    return {
      ...profile,
      name: alias || profile.name,
      realName: profile.name,
      alias,
      isOwn,
      relationship,
      friendCount,
      stats,
      canBlock: viewer.kind === "user" && isTrainee && !isOwn,
      canReport: isTrainee && !isOwn,
      composerPrivacy,
    };
  }

  // A trainee's profile stats. Callers decide who may see them first.
  async trainingStats(userId: number) {
    const [days, sets]: [{ date: string }[], { total: number }[]] =
      await Promise.all([
        this.dataSource.query(
          `SELECT DISTINCT wd.date FROM exercise_completions ec
           JOIN exercises e ON e.id = ec.exercise_id
           JOIN workout_days wd ON wd.id = e.day_id
           WHERE ec.user_id = $1`,
          [userId],
        ),
        this.dataSource.query(
          `SELECT count(*)::int AS total FROM exercise_sets WHERE user_id = $1`,
          [userId],
        ),
      ]);
    const dates = days.map((row) => row.date);

    return {
      workouts: dates.length,
      streak: computeDayStreak(
        dates,
        getTodayDate(WORKOUT_TIME_ZONE, this.clock.now()),
      ),
      totalSets: sets[0]?.total ?? 0,
    };
  }
}
