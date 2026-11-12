// Pure rules for scripts/jira-sync.ts: which KAN tickets a PR names and which
// Jira status a PR event moves them to.

export type PullRequestEvent = {
  action: string;
  title: string;
  headRef: string;
  draft: boolean;
  merged: boolean;
};

export type JiraTransition = { id: string; to: { name: string } };

const TICKET_KEY = /\bKAN-(\d+)\b/gi;

// Unique keys from the PR title and head branch, upper-cased, in order seen.
export const extractTicketKeys = (...sources: string[]) => {
  const keys = new Set<string>();

  for (const source of sources) {
    for (const match of source.matchAll(TICKET_KEY)) {
      keys.add(`KAN-${match[1]}`);
    }
  }
  return [...keys];
};

// The integration branch. Task PRs merge into it; the release PR (stag ->
// main) carries tickets that are already Done, so it moves nothing.
export const INTEGRATION_BRANCH = "stag";

// In Review when a ready PR opens, Done when it merges, otherwise nothing.
export const targetStatusFor = (event: PullRequestEvent) => {
  if (event.headRef === INTEGRATION_BRANCH) {
    return null;
  }
  if (event.action === "closed") {
    return event.merged ? "Done" : null;
  }
  if (["opened", "reopened", "ready_for_review"].includes(event.action)) {
    return event.draft ? null : "In Review";
  }
  return null;
};

export const pickTransition = (
  transitions: JiraTransition[],
  targetStatus: string,
) =>
  transitions.find(
    (transition) =>
      transition.to.name.toLowerCase() === targetStatus.toLowerCase(),
  ) ?? null;
