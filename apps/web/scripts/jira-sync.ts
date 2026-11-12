// Moves the KAN tickets named by a PR to In Review (PR opened) or Done (PR
// merged). Run by .github/workflows/jira-sync.yml; needs JIRA_EMAIL and
// JIRA_API_TOKEN, and exits quietly without them.
import { readFileSync } from "node:fs";

import {
  extractTicketKeys,
  type JiraTransition,
  pickTransition,
  targetStatusFor,
} from "./jira-transition-rules";

const JIRA_BASE_URL =
  process.env.JIRA_BASE_URL ?? "https://hoan-workspace.atlassian.net";

const jira = async (path: string, init: RequestInit = {}) => {
  const auth = Buffer.from(
    `${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`,
  ).toString("base64");
  const response = await fetch(`${JIRA_BASE_URL}/rest/api/3${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path}: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
};

const moveTicket = async (key: string, targetStatus: string) => {
  const issue = await jira(`/issue/${key}?fields=status`);

  if (issue.fields.status.name.toLowerCase() === targetStatus.toLowerCase()) {
    console.log(`${key} is already ${targetStatus}`);
    return;
  }

  const { transitions } = (await jira(`/issue/${key}/transitions`)) as {
    transitions: JiraTransition[];
  };
  const transition = pickTransition(transitions, targetStatus);

  if (!transition) {
    console.log(
      `::warning::${key}: no transition from ${issue.fields.status.name} to ${targetStatus}`,
    );
    return;
  }

  await jira(`/issue/${key}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transition.id } }),
  });
  console.log(`${key}: ${issue.fields.status.name} -> ${targetStatus}`);
};

const main = async () => {
  if (!process.env.JIRA_EMAIL || !process.env.JIRA_API_TOKEN) {
    console.log("::notice::JIRA_EMAIL or JIRA_API_TOKEN is not set; skipping");
    return;
  }

  const payload = JSON.parse(
    readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
  );
  const pr = payload.pull_request;
  const targetStatus = targetStatusFor({
    action: payload.action,
    title: pr.title,
    headRef: pr.head.ref,
    draft: pr.draft,
    merged: pr.merged,
  });
  const keys = extractTicketKeys(pr.title, pr.head.ref);

  if (!targetStatus || keys.length === 0) {
    console.log(`Nothing to move (action ${payload.action}, keys ${keys})`);
    return;
  }

  for (const key of keys) {
    await moveTicket(key, targetStatus);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
