import { expect, test } from "@playwright/test";
import { RESTRICTION_MESSAGES } from "@pt/contracts";

import { prepareChatTrainee } from "./api-seed-chat";
import { createGroupViaApi, getGroupBodies } from "./api-seed-groups";
import {
  blockTraineeViaApi,
  createPtViaApi,
  createTraineeViaApi,
} from "./api-seed-users";
import { E2E_ADMIN } from "./config";
import { answerConfirm } from "./confirm";
import {
  bubble,
  entry,
  groupRow,
  longPress,
  newSession,
  openGroup,
  PT_PASSWORD,
  send,
  sheet,
  signInAdmin,
  signInTrainee,
  SYNC,
  tag,
} from "./group-ui";

// Group chat (company/main docs/specs/group-chat.md, on the API of PR #40):
// the inbox section, the thread and sending. Each test creates its own PT,
// trainee and group (unique names), so reruns never share data. The other side
// gets every change over the realtime socket, or the polling fallback.
const QUOTE = "Xem tin nhắn được trả lời";
const UNSENT = "Tin nhắn đã bị thu hồi";
const UNSEND_TITLE = "Thu hồi tin nhắn này với mọi người?";

test("a PT and a trainee see a new group in their inbox, and a message reaches the other live with the unread badge", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const ptName = `e2e-group-pt-${suffix}`;
  const ptId = await createPtViaApi(ptName, PT_PASSWORD);
  const traineeName = `E2E Group Trainee ${suffix}`;
  const userId = await createTraineeViaApi(traineeName, { ptAdminId: ptId });

  await prepareChatTrainee(traineeName);
  const groupName = `Lớp sáng ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [userId],
    ptIds: [ptId],
  });
  const pt = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await signInAdmin(pt.page, ptName, PT_PASSWORD);
    await pt.page.goto("/admin/messages");
    await expect(groupRow(pt.page, groupName)).toBeVisible();

    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto("/messages");
    await expect(groupRow(trainee.page, groupName)).toBeVisible();
    await expect(
      groupRow(trainee.page, groupName).getByRole("status"),
    ).toHaveCount(0);

    // The PT writes; the trainee's inbox row and tab badge count it, live.
    await openGroup(pt.page, groupName);
    const hello = `Chào cả nhóm ${suffix}`;

    await send(pt.page, hello);
    await expect(bubble(pt.page, hello)).toBeVisible();
    await expect(
      groupRow(trainee.page, groupName).getByRole("status", {
        name: "1 tin chưa đọc",
      }),
    ).toBeVisible(SYNC);
    await expect(groupRow(trainee.page, groupName)).toContainText(hello);
    await expect(
      trainee.page
        .getByRole("navigation")
        .getByRole("status", { name: "1 tin nhắn chưa đọc" }),
    ).toBeVisible(SYNC);

    // Opening the group reads it: the PT's name and tag are on the bubble.
    await openGroup(trainee.page, groupName);
    await expect(bubble(trainee.page, hello)).toBeVisible();
    await expect(entry(trainee.page, hello)).toContainText(ptName);
    await expect(entry(trainee.page, hello)).toContainText("PT");

    // The trainee answers; the PT's open thread shows it without a reload.
    const answer = `Dạ em chào thầy ${suffix}`;

    await send(trainee.page, answer);
    await expect(bubble(trainee.page, answer)).toBeVisible();
    await expect(bubble(pt.page, answer)).toBeVisible(SYNC);
    await expect(entry(pt.page, answer)).toContainText(traineeName);

    // Back in the inbox the group is read.
    await trainee.page.getByRole("link", { name: "Quay lại" }).click();
    await expect(groupRow(trainee.page, groupName)).toBeVisible();
    await expect(
      groupRow(trainee.page, groupName).getByRole("status"),
    ).toHaveCount(0, SYNC);
    expect(await getGroupBodies(groupId)).toEqual([hello, answer]);
  } finally {
    await pt.context.close();
    await trainee.context.close();
  }
});

test("reply, react, edit and unsend in a group reach the other member", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const traineeName = `E2E Group Actions ${suffix}`;
  const userId = await createTraineeViaApi(traineeName);

  await prepareChatTrainee(traineeName);
  const groupName = `Nhóm thao tác ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [userId],
  });
  const admin = await newSession(browser);
  const trainee = await newSession(browser);

  try {
    await signInAdmin(admin.page, E2E_ADMIN.username, E2E_ADMIN.password);
    await admin.page.goto(`/admin/messages/groups/${groupId}`);
    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto(`/messages/groups/${groupId}`);
    // The super admin's add shows as a system line for everyone.
    await expect(
      trainee.page
        .getByRole("log")
        .getByText(`${E2E_ADMIN.username} đã thêm ${traineeName} vào nhóm`),
    ).toBeVisible();

    const question = `Hôm nay tập gì ạ ${suffix}`;

    await send(trainee.page, question);
    await expect(bubble(admin.page, question)).toBeVisible(SYNC);
    await expect(entry(admin.page, question)).toContainText(traineeName);

    // Reply: the quote shows on both sides.
    await longPress(admin.page, question);
    await sheet(admin.page)
      .getByRole("button", { name: "Trả lời", exact: true })
      .click();
    await expect(admin.page.getByText(/^Đang trả lời/)).toBeVisible();
    const reply = `Tập chân nhé ${suffix}`;

    await send(admin.page, reply);
    await expect(
      bubble(admin.page, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(question);
    await expect(
      bubble(trainee.page, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(question, SYNC);
    await expect(entry(trainee.page, reply)).toContainText("Quản lý");

    // React: a heart from the trainee shows on the manager's screen.
    await longPress(trainee.page, reply);
    await sheet(trainee.page).getByRole("button", { name: "❤️" }).click();
    await expect(sheet(trainee.page)).toHaveCount(0);
    await expect(
      entry(trainee.page, reply).getByRole("button", { name: "❤️ 1" }),
    ).toBeVisible();
    await expect(
      entry(admin.page, reply).getByRole("button", { name: "❤️ 1" }),
    ).toBeVisible(SYNC);

    // Edit: the new text and the label reach the manager, with the history.
    await longPress(trainee.page, question);
    await sheet(trainee.page)
      .getByRole("button", { name: "Chỉnh sửa" })
      .click();
    const edited = `${question} buổi chiều`;

    await trainee.page.getByLabel("Nội dung tin nhắn").fill(edited);
    await trainee.page.getByRole("button", { name: "Lưu chỉnh sửa" }).click();
    await expect(bubble(trainee.page, edited)).toBeVisible();
    await expect(bubble(admin.page, edited)).toBeVisible(SYNC);
    await expect(bubble(admin.page, question)).toHaveCount(0);
    await entry(admin.page, edited)
      .getByRole("button", { name: "Đã chỉnh sửa" })
      .click();
    await expect(
      sheet(admin.page).getByText(question, { exact: true }),
    ).toBeVisible();
    await admin.page.keyboard.press("Escape");
    await expect(sheet(admin.page)).toHaveCount(0);

    // Unsend: both sides see the tombstone, the quote too.
    await longPress(trainee.page, edited);
    await sheet(trainee.page)
      .getByRole("button", { name: "Thu hồi", exact: true })
      .click();
    await answerConfirm(trainee.page, "Thu hồi", UNSEND_TITLE);
    await expect(bubble(trainee.page, edited)).toHaveCount(0);
    await expect(bubble(trainee.page, UNSENT)).toBeVisible();
    await expect(bubble(admin.page, edited)).toHaveCount(0, SYNC);
    await expect(bubble(admin.page, UNSENT)).toBeVisible();
    await expect(
      bubble(admin.page, reply).getByRole("button", { name: QUOTE }),
    ).toContainText(UNSENT);
  } finally {
    await admin.context.close();
    await trainee.context.close();
  }
});

test("a restricted trainee's group send is refused with the restricted message", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const suffix = tag();
  const traineeName = `E2E Group Restricted ${suffix}`;
  const userId = await createTraineeViaApi(traineeName);

  await prepareChatTrainee(traineeName);
  const groupName = `Nhóm hạn chế ${suffix}`;
  const groupId = await createGroupViaApi({
    name: groupName,
    userIds: [userId],
  });
  const trainee = await newSession(browser);

  try {
    await signInTrainee(trainee.page, traineeName);
    await trainee.page.goto(`/messages/groups/${groupId}`);
    await expect(trainee.page.getByLabel("Nội dung tin nhắn")).toBeVisible();

    // Blocked while the thread is open, before its next fetch: the composer
    // is still there and the API refuses the send. The thread's own fetches
    // are held back so the refresh cannot swap the composer for the banner
    // first (the send itself is a server action, not this route).
    const threadFetches = `**/api/chat/groups/${groupId}/messages**`;

    await trainee.page.route(threadFetches, (route) => route.abort());
    await blockTraineeViaApi(userId, {
      level: "restricted",
      duration: "7d",
      reason: "Gửi nội dung không phù hợp",
    });
    await send(trainee.page, `Bị chặn ${suffix}`);
    await expect(
      trainee.page
        .getByRole("alert")
        .filter({ hasText: RESTRICTION_MESSAGES.RESTRICTED }),
    ).toBeVisible();
    expect(await getGroupBodies(groupId)).toEqual([]);
    await trainee.page.unroute(threadFetches);

    // Opened again, the thread shows the banner instead of the composer.
    const banner = trainee.page.getByText(
      "Tài khoản của bạn đang bị hạn chế nên chưa gửi được tin nhắn.",
      { exact: true },
    );

    await trainee.page.reload();
    await expect(banner).toBeVisible();
    await expect(trainee.page.getByLabel("Nội dung tin nhắn")).toHaveCount(0);
  } finally {
    await trainee.context.close();
  }
});
