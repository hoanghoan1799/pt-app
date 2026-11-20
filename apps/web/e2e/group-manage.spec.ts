import { expect, type Page, test } from "@playwright/test";

import { withApiDb } from "./api-db";
import { prepareChatTrainee } from "./api-seed-chat";
import { createGroupViaApi } from "./api-seed-groups";
import { acceptTermsApi } from "./api-seed-social";
import {
  callE2eApi,
  createPtViaApi,
  createTraineeViaApi,
  loginAdminViaApi,
  loginTraineeViaApi,
} from "./api-seed-users";
import { E2E_ADMIN, E2E_API_URL } from "./config";
import { answerConfirm } from "./confirm";
import {
  bubble,
  groupRow,
  longPress,
  newSession,
  PT_PASSWORD,
  send,
  sheet,
  signInAdmin,
  signInTrainee,
  SYNC,
  tag,
} from "./group-ui";

// Group chat, part 2 (company/main docs/specs/group-chat.md G1 to G24): the
// create page, the info pages (rename, remove, leave, dissolve) and reporting
// a group message. Each test creates its own people and group (unique names),
// so reruns never share data. The other side gets every change over the
// realtime socket, or the polling fallback.

// The group row of the info page's member list.
const memberRow = (page: Page, name: string) =>
  page.getByRole("main").getByRole("listitem").filter({ hasText: name });

const openInfo = async (page: Page) => {
  await page.getByRole("link", { name: "Thông tin nhóm" }).click();
  await expect(page).toHaveURL(/\/messages\/groups\/\d+\/info$/);
};

const groupNameOf = (groupId: number) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT name, dissolved_at FROM chat_groups WHERE id = $1`,
      [groupId],
    );

    return result.rows[0] as { name: string; dissolved_at: Date | null };
  });

const activeMemberKeys = (groupId: number) =>
  withApiDb(async (client) => {
    const result = await client.query(
      `SELECT member_key FROM chat_group_members
        WHERE group_id = $1 AND left_at IS NULL ORDER BY member_key`,
      [groupId],
    );

    return result.rows.map((row) => String(row.member_key));
  });

const expectNotFound = async (page: Page) => {
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
};

test("a super admin creates a group with a trainee and a PT on the create page, and both see it", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const ptName = `e2e-gcreate-pt-${suffix}`;
  const ptId = await createPtViaApi(ptName, PT_PASSWORD);
  const traineeName = `E2E Group Create ${suffix}`;
  const userId = await createTraineeViaApi(traineeName, { ptAdminId: ptId });

  await prepareChatTrainee(traineeName);
  const groupName = `Nhóm mới ${suffix}`;
  const admin = await newSession(browser);
  const pt = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto("/admin/messages");
    await admin.page.getByRole("link", { name: "Tạo nhóm" }).click();
    await expect(admin.page).toHaveURL(/\/admin\/messages\/groups\/new$/);
    await expect(
      admin.page.getByRole("heading", { name: "Tạo nhóm chat" }),
    ).toBeVisible();

    await admin.page.getByLabel("Tên nhóm").fill(groupName);
    const search = admin.page.getByLabel("Tìm theo tên");

    // A super admin is offered every trainee and every PT: pick one of each.
    await search.fill(traineeName);
    await admin.page.getByRole("checkbox", { name: traineeName }).check();
    await search.fill(ptName);
    await admin.page.getByRole("checkbox", { name: ptName }).check();
    await expect(admin.page.getByText("Đã chọn 2/50")).toBeVisible();
    await admin.page.getByRole("button", { name: "Tạo nhóm" }).click();

    // The new group's thread opens, with the add line for both.
    await expect(admin.page).toHaveURL(/\/admin\/messages\/groups\/\d+$/);
    const groupId = Number(admin.page.url().split("/").at(-1));

    await expect(
      admin.page.getByRole("log", { name: `Tin nhắn trong nhóm ${groupName}` }),
    ).toBeAttached();
    expect((await groupNameOf(groupId)).name).toBe(groupName);
    expect(await activeMemberKeys(groupId)).toEqual(
      [`admin:${ptId}`, `user:${userId}`].sort(),
    );

    await signInAdmin(pt.page, ptName, PT_PASSWORD);
    await pt.page.goto("/admin/messages");
    await expect(groupRow(pt.page, groupName)).toBeVisible();

    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto("/messages");
    await expect(groupRow(trainee.page, groupName)).toBeVisible();
  } finally {
    await admin.context.close();
    await pt.context.close();
    await trainee.context.close();
  }
});

test("a manager renames the group and removes a member, who then gets the not-found page", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const stayingName = `E2E Group Stays ${suffix}`;
  const removedName = `E2E Group Removed ${suffix}`;
  const stayingId = await createTraineeViaApi(stayingName);
  const removedId = await createTraineeViaApi(removedName);

  await prepareChatTrainee(stayingName);
  await prepareChatTrainee(removedName);
  const groupName = `Nhóm đổi tên ${suffix}`;
  const newName = `Nhóm tên mới ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [stayingId, removedId],
  });
  const admin = await newSession(browser);
  const staying = await newSession(browser);
  const removed = await newSession(browser);

  try {
    await signInTrainee(staying.page, stayingName);
    await staying.page.goto(`/messages/groups/${groupId}`);
    await expect(
      staying.page.getByRole("heading", { level: 1, name: groupName }),
    ).toBeVisible();
    await signInTrainee(removed.page, removedName);
    await removed.page.goto(`/messages/groups/${groupId}`);
    await expect(
      removed.page.getByRole("heading", { level: 1, name: groupName }),
    ).toBeVisible();

    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto(`/admin/messages/groups/${groupId}`);
    await openInfo(admin.page);
    await expect(
      admin.page.getByRole("heading", { name: "Thành viên (3)" }),
    ).toBeVisible();

    // Rename: the info page, the open trainee thread (live) and the stored row.
    await admin.page.getByLabel("Đổi tên nhóm").fill(`  ${newName} `);
    await admin.page.getByRole("button", { name: "Lưu tên" }).click();
    await expect(admin.page.getByText("Đã đổi tên nhóm")).toBeVisible();
    await expect(
      admin.page.getByRole("heading", { level: 2, name: newName }),
    ).toBeVisible();
    await expect(
      staying.page.getByRole("heading", { level: 1, name: newName }),
    ).toBeVisible(SYNC);
    await expect(
      staying.page
        .getByRole("log")
        .getByText(
          `${E2E_ADMIN.username} đã đổi tên nhóm từ "${groupName}" thành "${newName}"`,
        ),
    ).toBeVisible(SYNC);
    expect((await groupNameOf(groupId)).name).toBe(newName);

    // Remove: confirm, the row leaves, the member count drops.
    await memberRow(admin.page, removedName)
      .getByRole("button", { name: `Xoá ${removedName} khỏi nhóm?` })
      .click();
    await answerConfirm(admin.page, "Xoá", `Xoá ${removedName} khỏi nhóm?`);
    await expect(memberRow(admin.page, removedName)).toHaveCount(0);
    await expect(
      admin.page.getByRole("heading", { name: "Thành viên (2)" }),
    ).toBeVisible();
    expect(await activeMemberKeys(groupId)).toEqual([`user:${stayingId}`]);

    // The removed trainee can no longer open the group or its info page.
    await removed.page.reload();
    await expectNotFound(removed.page);
    await removed.page.goto(`/messages/groups/${groupId}/info`);
    await expectNotFound(removed.page);
    await removed.page.goto("/messages");
    await expect(
      removed.page.getByRole("link", { name: new RegExp(newName) }),
    ).toHaveCount(0);
  } finally {
    await admin.context.close();
    await staying.context.close();
    await removed.context.close();
  }
});

test("a member leaves the group from its info page", async ({ browser }) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const traineeName = `E2E Group Leaves ${suffix}`;
  const userId = await createTraineeViaApi(traineeName);

  await prepareChatTrainee(traineeName);
  const groupName = `Nhóm rời ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [userId],
  });
  const admin = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    // The manager keeps the info page open: the member leaves it live.
    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto(`/admin/messages/groups/${groupId}/info`);
    await expect(memberRow(admin.page, traineeName)).toBeVisible();

    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto(`/messages/groups/${groupId}`);
    await openInfo(trainee.page);
    // The trainee's page: labels only, no manage controls.
    await expect(memberRow(trainee.page, traineeName)).toContainText("Bạn");
    await expect(trainee.page.getByLabel("Đổi tên nhóm")).toHaveCount(0);
    await expect(
      trainee.page.getByRole("button", { name: /khỏi nhóm\?$/ }),
    ).toHaveCount(0);

    await trainee.page.getByRole("button", { name: "Rời nhóm" }).click();
    await answerConfirm(trainee.page, "Rời nhóm", "Rời nhóm này?");
    await expect(trainee.page).toHaveURL(/\/messages$/);
    await expect(groupRow(trainee.page, groupName)).toHaveCount(0);
    expect(await activeMemberKeys(groupId)).toEqual([]);

    await expect(memberRow(admin.page, traineeName)).toHaveCount(0, SYNC);

    await trainee.page.goto(`/messages/groups/${groupId}`);
    await expectNotFound(trainee.page);
  } finally {
    await admin.context.close();
    await trainee.context.close();
  }
});

test("a member reports a group message and the super admin sees it with the group name", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const traineeName = `E2E Group Reporter ${suffix}`;
  const userId = await createTraineeViaApi(traineeName);

  await prepareChatTrainee(traineeName);
  // Reporting is a social feature: the API asks for the terms first.
  await acceptTermsApi(await loginTraineeViaApi(traineeName));
  const groupName = `Nhóm báo cáo ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [userId],
  });
  const admin = await newSession(browser);
  const trainee = await newSession(browser);
  const reported = `Tin nhắn bị báo cáo ${suffix}`;

  try {
    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto(`/admin/messages/groups/${groupId}`);
    await send(admin.page, reported);

    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto(`/messages/groups/${groupId}`);
    await expect(bubble(trainee.page, reported)).toBeVisible();
    await longPress(trainee.page, reported);
    await sheet(trainee.page)
      .getByRole("button", { name: "Báo cáo", exact: true })
      .click();
    const report = trainee.page.getByRole("dialog", {
      name: "Báo cáo tin nhắn nhóm",
    });

    await expect(report).toBeVisible();
    await report.getByLabel("Quấy rối").check();
    await report.getByRole("button", { name: "Gửi báo cáo" }).click();
    await expect(
      trainee.page.getByText("Đã gửi báo cáo. Cảm ơn bạn."),
    ).toBeVisible();

    // The super admin's queue: kind, the message, its sender and group, and a
    // link into the group.
    await admin.page.goto("/admin/reports");
    const row = admin.page
      .getByRole("listitem")
      .filter({ hasText: `Nhóm: ${groupName}` });

    await expect(row).toHaveCount(1);
    await expect(row).toContainText("Tin nhắn nhóm");
    await expect(row).toContainText(reported);
    await expect(row).toContainText(E2E_ADMIN.username);
    await expect(row).toContainText(traineeName);
    await row.getByRole("link", { name: "Mở nhóm" }).click();
    await expect(admin.page).toHaveURL(
      new RegExp(`/admin/messages/groups/${groupId}$`),
    );
    await expect(bubble(admin.page, reported)).toBeVisible();
  } finally {
    await admin.context.close();
    await trainee.context.close();
  }
});

test("a PT cannot dissolve a group, a super admin can", async ({ browser }) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const ptName = `e2e-gdissolve-pt-${suffix}`;
  const ptId = await createPtViaApi(ptName, PT_PASSWORD);
  const traineeName = `E2E Group Dissolve ${suffix}`;
  const userId = await createTraineeViaApi(traineeName, { ptAdminId: ptId });

  await prepareChatTrainee(traineeName);
  const groupName = `Nhóm giải tán ${suffix}`;
  // The PT creates it, so the PT manages it: rename, add, remove, but no
  // dissolve (super admin only, G6).
  const ptToken = await loginAdminViaApi(ptName, PT_PASSWORD);
  const { groupId } = await callE2eApi<{ groupId: number }>(
    "POST",
    "/v1/chat/groups",
    { token: ptToken, body: { name: groupName, userIds: [userId] } },
  );
  const pt = await newSession(browser);
  const admin = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await signInAdmin(pt.page, ptName, PT_PASSWORD);
    await pt.page.goto(`/admin/messages/groups/${groupId}`);
    await openInfo(pt.page);
    await expect(memberRow(pt.page, ptName)).toContainText("Người tạo");
    await expect(pt.page.getByLabel("Đổi tên nhóm")).toBeVisible();
    await expect(
      pt.page.getByRole("button", { name: "Giải tán nhóm" }),
    ).toHaveCount(0);
    await expect(
      pt.page.getByRole("button", { name: "Rời nhóm" }),
    ).toBeVisible();
    // The API refuses the PT as well.
    const refused = await fetch(`${E2E_API_URL}/v1/chat/groups/${groupId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ptToken}` },
    });

    expect(refused.status).toBe(403);
    expect((await groupNameOf(groupId)).dissolved_at).toBeNull();

    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto("/messages");
    await expect(groupRow(trainee.page, groupName)).toBeVisible();

    // The super admin dissolves it from the info page.
    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto(`/admin/messages/groups/${groupId}/info`);
    await expect(
      admin.page.getByRole("button", { name: "Rời nhóm" }),
    ).toHaveCount(0);
    await admin.page.getByRole("button", { name: "Giải tán nhóm" }).click();
    await answerConfirm(admin.page, "Giải tán nhóm", "Giải tán nhóm này?");
    await expect(admin.page).toHaveURL(/\/admin\/messages$/);
    await expect(groupRow(admin.page, groupName)).toHaveCount(0);
    expect((await groupNameOf(groupId)).dissolved_at).not.toBeNull();

    // Gone for the members; a super admin can still open it read-only.
    await pt.page.reload();
    await expectNotFound(pt.page);
    await trainee.page.reload();
    await expect(groupRow(trainee.page, groupName)).toHaveCount(0);
    await admin.page.goto(`/admin/messages/groups/${groupId}/info`);
    await expect(
      admin.page.getByText("Nhóm đã giải tán. Chỉ quản lý tổng xem lại được."),
    ).toBeVisible();
  } finally {
    await pt.context.close();
    await admin.context.close();
    await trainee.context.close();
  }
});
