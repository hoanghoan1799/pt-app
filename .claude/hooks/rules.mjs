// Pure rules for the PreToolUse hook, kept separate so Vitest can cover them.

// `stag` is the integration branch every task PR targets; `main` only takes
// the release PR (docs/release.md). Neither takes a direct push.
const PROTECTED_BRANCHES = ["main", "master", "stag"];

const ENV_FILE_PATTERN = /(^|[\s/"'=<])\.env(\.[\w.-]+)?(?=$|[\s"';|&)>])/g;

// The README setup step: create the local env file from the template (the web
// app's, in apps/web/).
const ENV_TEMPLATE_COPY_PATTERN =
  /\bcp\s+(-n\s+)?(\.\/|apps\/web\/)?\.env\.example\s+(\.\/|apps\/web\/)?\.env\.local(?=$|[\s;|&)])/g;

// The quoted text after -m / --message on a git commit.
const COMMIT_MESSAGE_PATTERN =
  /(?:-m|--message)(?:=|\s+)(?:"(?:[^"\\]|\\.)*"|'[^']*')/g;

const hasFlag = (command, flag) =>
  new RegExp(`(^|\\s)${flag}(?=$|[\\s=])`).test(command);

const pushTargetsProtectedBranch = (command, currentBranch) => {
  const args = command.replace(/^.*?\bgit\s+push\b/, "").trim();
  const positional = args
    .split(/\s+/)
    .filter((arg) => arg && !arg.startsWith("-"));
  // `git push origin feature:stag` or `git push origin main`.
  const refs = positional.slice(1).map((ref) => ref.split(":").pop());

  if (refs.length > 0) {
    return refs.some((ref) =>
      PROTECTED_BRANCHES.includes(ref.replace(/^refs\/heads\//, "")),
    );
  }
  // A bare `git push` pushes the current branch.
  return PROTECTED_BRANCHES.includes(currentBranch);
};

// Copying the template is fine, but a plain `cp` over an existing local env
// file would wipe its secrets, so then only `cp -n` (no clobber) is allowed.
const stripTemplateCopies = (command, envLocalExists) =>
  command.replace(ENV_TEMPLATE_COPY_PATTERN, (match, noClobber) =>
    noClobber || !envLocalExists ? "" : match,
  );

// Returns the reason a Bash command is blocked, or null when it may run.
export const findViolation = (
  command,
  currentBranch = "",
  { envLocalExists = true } = {},
) => {
  const isPush = /\bgit\s+push\b/.test(command);
  const isCommit = /\bgit\s+commit\b/.test(command);

  if (isPush && (hasFlag(command, "--force") || hasFlag(command, "-f"))) {
    return "Force-push is not allowed. Use --force-with-lease on your own branch only if you really must.";
  }
  if (isPush && pushTargetsProtectedBranch(command, currentBranch)) {
    return "Pushing to main or stag is not allowed. Push a ticket branch and open a PR into stag.";
  }
  if ((isPush || isCommit) && hasFlag(command, "--no-verify")) {
    return "--no-verify skips the repo's checks. Fix what the check reports instead.";
  }
  if (isCommit && /co-authored-by:\s*claude|claude-session:/i.test(command)) {
    return "Commits must not carry Co-Authored-By: Claude or Claude-Session lines. Remove them from the message.";
  }
  // A commit message may mention .env; only real file access counts.
  const withoutMessages = stripTemplateCopies(
    command.replace(COMMIT_MESSAGE_PATTERN, ""),
    envLocalExists,
  );
  const envFiles = [...withoutMessages.matchAll(ENV_FILE_PATTERN)].map(
    (match) => match[0].trim(),
  );

  if (envFiles.some((file) => !file.endsWith(".env.example"))) {
    return "Do not read or touch .env files from the shell; they hold secrets. Use .env.example for the variable names.";
  }
  return null;
};
