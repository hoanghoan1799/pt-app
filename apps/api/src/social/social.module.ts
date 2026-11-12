import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { SocialAccountQueries } from "./accounts.queries.js";
import { CommentPolicy } from "./domain/comment.policy.js";
import { PostPolicy } from "./domain/post.policy.js";
import { EngagementController } from "./engagement.controller.js";
import { EngagementService } from "./engagement.service.js";
import { SocialEventsPublisher } from "./events/social-events.publisher.js";
import { FriendsController } from "./friends.controller.js";
import { FriendsService } from "./friends.service.js";
import { NotificationsController } from "./notifications/notifications.controller.js";
import { NotificationsListener } from "./notifications/notifications.listener.js";
import { NotificationsService } from "./notifications/notifications.service.js";
import { PhotosController } from "./photos/photos.controller.js";
import { PhotosService } from "./photos/photos.service.js";
import {
  ByteaSocialPhotoStorage,
  SocialPhotoStorage,
} from "./photos/social-photo-storage.js";
import { PostAccess } from "./post-access.service.js";
import { PostsController } from "./posts.controller.js";
import { PostQueries } from "./posts.queries.js";
import { PostsService } from "./posts.service.js";
import { ProfilesService } from "./profiles.service.js";
import { RelationshipQueries } from "./relationships.queries.js";
import { ReportsController } from "./reports.controller.js";
import { ReportsService } from "./reports.service.js";
import { SocialCleanupService } from "./social-cleanup.service.js";
import { SocialTermsGuard } from "./terms.guard.js";

// Profiles, posts, comments, reactions, friends, blocks, reports, feed and
// notifications. Notifications are produced by domain events
// (@nestjs/event-emitter): services publish after the commit, the
// NotificationsListener writes the rows and announces `social.notification.created`
// for push and chat. Guards (session, roles, PT scope) are global, from AuthModule.
@Module({
  imports: [AuthModule],
  controllers: [
    PostsController,
    EngagementController,
    FriendsController,
    ReportsController,
    NotificationsController,
    PhotosController,
  ],
  providers: [
    PostPolicy,
    CommentPolicy,
    SocialAccountQueries,
    RelationshipQueries,
    PostAccess,
    PostQueries,
    PostsService,
    EngagementService,
    FriendsService,
    ReportsService,
    ProfilesService,
    NotificationsService,
    NotificationsListener,
    SocialEventsPublisher,
    PhotosService,
    SocialTermsGuard,
    SocialCleanupService,
    // Swap for the shared FilesModule FileStorage at merge time.
    { provide: SocialPhotoStorage, useClass: ByteaSocialPhotoStorage },
  ],
  exports: [SocialCleanupService],
})
export class SocialModule {}
