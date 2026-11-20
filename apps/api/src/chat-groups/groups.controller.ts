import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  type GroupAddMembersRequest,
  groupAddMembersRequestSchema,
  groupAddMembersResponseSchema,
  groupAvatarResponseSchema,
  type GroupCandidatesQuery,
  groupCandidatesQuerySchema,
  groupCandidatesResponseSchema,
  type GroupCreateRequest,
  groupCreateRequestSchema,
  groupCreateResponseSchema,
  groupInfoResponseSchema,
  groupListResponseSchema,
  type GroupManagersOnlyRequest,
  groupManagersOnlyRequestSchema,
  groupMemberKeyParamSchema,
  type GroupMuteRequest,
  groupMuteRequestSchema,
  type GroupRenameRequest,
  groupRenameRequestSchema,
  groupUnreadResponseSchema,
  idParamSchema,
  type SetAvatarRequest,
  setAvatarRequestSchema,
} from "@pt/contracts";
import type { Response } from "express";

import type { AdminActor, AuthActor } from "../auth/actor.js";
import { Actor, Admin, Roles } from "../auth/decorators/index.js";
import { ApiRoute } from "../common/openapi/api-route.js";
import { GroupInboxService } from "./group-inbox.service.js";
import { GroupMembershipService } from "./group-membership.service.js";
import { GroupPhotosService } from "./group-photos.service.js";

const idParam = { schema: idParamSchema };

// Group chat: the lists, the info page and every change to a group's members
// and settings. The caller always comes from the session and every request
// re-checks membership (GroupAccess): a missing or dissolved group, a
// non-member and a left member all answer 404. Static routes come first so
// "unread" is never read as an id.
@ApiTags("chat-groups")
@Controller("chat/groups")
export class GroupsController {
  constructor(
    private readonly inbox: GroupInboxService,
    private readonly membership: GroupMembershipService,
    private readonly photos: GroupPhotosService,
  ) {}

  @Get()
  @ApiRoute({
    summary:
      "My groups, newest first, with the last message, unread and mute (a super admin: every group that is not dissolved)",
    response: groupListResponseSchema,
    errors: [401, 403],
  })
  async list(
    @Actor() actor: AuthActor,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.set("Cache-Control", "no-store");
    return { groups: await this.inbox.list(actor) };
  }

  @Post()
  @Admin()
  @ApiRoute({
    summary:
      "Create a group (super admin or PT) with trainees (and, for a super admin, PTs); each id gets its own result",
    body: groupCreateRequestSchema,
    response: groupCreateResponseSchema,
    status: 201,
    errors: [400, 401, 403],
  })
  create(
    @Actor() actor: AdminActor,
    @Body({ schema: groupCreateRequestSchema }) body: GroupCreateRequest,
  ) {
    return this.membership.create(actor, body);
  }

  @Get("unread")
  @ApiRoute({
    summary:
      "Group badge poll: total and per group (own, system lines, alerts, unsent and hidden messages never count)",
    response: groupUnreadResponseSchema,
    errors: [401, 403],
  })
  unread(@Actor() actor: AuthActor, @Res({ passthrough: true }) res: Response) {
    res.set("Cache-Control", "no-store");
    return this.inbox.unread(actor);
  }

  @Get("candidates")
  @Admin()
  @ApiRoute({
    summary:
      "Who the create / add picker offers: a PT their own visible trainees, a super admin every trainee and PT (groupId leaves out current members)",
    response: groupCandidatesResponseSchema,
    errors: [400, 401, 403],
  })
  candidates(
    @Actor() actor: AdminActor,
    @Query({ schema: groupCandidatesQuerySchema }) query: GroupCandidatesQuery,
  ) {
    return this.inbox.candidates(actor, query.groupId);
  }

  @Get(":groupId")
  @ApiRoute({
    summary:
      "The info page: the group, what I may do in it and its members (Manager, PT, trainee)",
    response: groupInfoResponseSchema,
    errors: [400, 401, 403, 404],
  })
  info(@Actor() actor: AuthActor, @Param("groupId", idParam) groupId: number) {
    return this.inbox.info(actor, groupId);
  }

  @Delete(":groupId")
  @Roles("super_admin")
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Dissolve a group (super admin): soft, the data stays, the group leaves every list and writes stop",
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async dissolve(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
  ): Promise<void> {
    await this.membership.dissolve(actor, groupId);
  }

  @Post(":groupId/members")
  @Admin()
  @ApiRoute({
    summary:
      "Add trainees (and, for a super admin, PTs); 409 GROUP_FULL when the cap of 50 left room for none",
    body: groupAddMembersRequestSchema,
    response: groupAddMembersResponseSchema,
    errors: [400, 401, 403, 404, 409],
  })
  add(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupAddMembersRequestSchema })
    body: GroupAddMembersRequest,
  ) {
    return this.membership.add(actor, groupId, body);
  }

  @Delete(":groupId/members/:memberKey")
  @Admin()
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Remove a member (user:<id> or admin:<id>); a super admin cannot be removed",
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async remove(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Param("memberKey", { schema: groupMemberKeyParamSchema })
    memberKey: string,
  ): Promise<void> {
    await this.membership.remove(actor, groupId, memberKey);
  }

  @Post(":groupId/leave")
  @HttpCode(204)
  @ApiRoute({
    summary:
      "Leave the group (trainee or PT); a super admin cannot. Rejoining needs an add",
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async leave(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
  ): Promise<void> {
    await this.membership.leave(actor, groupId);
  }

  @Put(":groupId/name")
  @Admin()
  @HttpCode(204)
  @ApiRoute({
    summary: "Rename the group (managers); the same name is a no-op",
    body: groupRenameRequestSchema,
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async rename(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupRenameRequestSchema }) body: GroupRenameRequest,
  ): Promise<void> {
    await this.membership.rename(actor, groupId, body.name);
  }

  @Put(":groupId/managers-only")
  @Admin()
  @HttpCode(204)
  @ApiRoute({
    summary: "Only managers can send (managers): on or off",
    body: groupManagersOnlyRequestSchema,
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async managersOnly(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupManagersOnlyRequestSchema })
    body: GroupManagersOnlyRequest,
  ): Promise<void> {
    await this.membership.setManagersOnly(actor, groupId, body.enabled);
  }

  @Put(":groupId/mute")
  @HttpCode(204)
  @ApiRoute({
    summary: "Mute or unmute my notifications of this group",
    body: groupMuteRequestSchema,
    status: 204,
    errors: [400, 401, 403, 404],
  })
  async mute(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: groupMuteRequestSchema }) body: GroupMuteRequest,
  ): Promise<void> {
    await this.membership.setMuted(actor, groupId, body.muted);
  }

  @Put(":groupId/avatar")
  @Admin()
  @ApiRoute({
    summary:
      "Set the group photo (managers): a 256x256 data URL, validated like account avatars",
    body: setAvatarRequestSchema,
    response: groupAvatarResponseSchema,
    errors: [400, 401, 403, 404, 413],
  })
  async setAvatar(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
    @Body({ schema: setAvatarRequestSchema }) body: SetAvatarRequest,
  ) {
    return {
      avatarUrl: await this.membership.setAvatar(actor, groupId, body.dataUrl),
    };
  }

  @Delete(":groupId/avatar")
  @Admin()
  @ApiRoute({
    summary: "Remove the group photo (managers)",
    response: groupAvatarResponseSchema,
    errors: [400, 401, 403, 404],
  })
  async clearAvatar(
    @Actor() actor: AdminActor,
    @Param("groupId", idParam) groupId: number,
  ) {
    return {
      avatarUrl: await this.membership.setAvatar(actor, groupId, null),
    };
  }

  // The signed `?v=&t=` URL from a payload is the capability (members need
  // none); a missing, wrong or stale token answers like a missing photo.
  @Get(":groupId/avatar")
  @ApiRoute({
    summary: "The group photo bytes (signed URL from a payload)",
    also: [
      { status: 200, description: "image/webp, image/jpeg or image/png" },
      { status: 304, description: "ETag matches" },
    ],
    errors: [400, 401, 404],
  })
  async avatar(
    @Actor() actor: AuthActor,
    @Param("groupId", idParam) groupId: number,
    @Query("v") queryVersion: string | undefined,
    @Query("t") token: string | undefined,
    @Headers("if-none-match") ifNoneMatch: string | undefined,
    @Res() res: Response,
  ) {
    const file = await this.photos.avatar(actor, groupId, token);
    const etag = `"${file.versionTag}"`;
    const headers = {
      ETag: etag,
      "Cache-Control":
        queryVersion === file.versionTag
          ? "private, max-age=31536000, immutable"
          : "private, no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    };

    if (ifNoneMatch === etag) {
      res.status(304).set(headers).end();
      return;
    }
    res
      .status(200)
      .set({ ...headers, "Content-Type": file.mime })
      .send(file.bytes);
  }
}
