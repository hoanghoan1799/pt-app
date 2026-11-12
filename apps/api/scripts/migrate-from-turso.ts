import { parseArgs } from "node:util";

import { run, type RunOptions } from "./migrate/run.js";

// One-time copy of ALL production data from Turso/libSQL into PostgreSQL, with
// proof that nothing was lost. Hoan runs this himself; see
// docs/backend/cutover-runbook.md. Rehearse on a local copy of the data first.
//
//   pnpm --filter @pt/api data:migrate -- --source file:./turso-copy.db \
//     --target postgres://... [--orphans=report|null|skip] [--reset] \
//     [--dry-run] [--report report.json]
//   pnpm --filter @pt/api data:verify -- --source ... --target ...   (verify only)

const USAGE = `Usage: data:migrate -- --source <url> --target <postgres url> [options]

  --source <url>        SQLite copy (file:./copy.db). Remote URLs need --allow-remote.
  --target <url>        PostgreSQL URL; the baseline migration must be applied.
  --orphans <mode>      report (default: abort), null (nullable FK columns only), skip
  --reset               truncate the 44 tables and sessions first (target must be a rehearsal or empty)
  --verify              only compare row counts and checksums, write nothing
  --dry-run             read, validate and scan orphans, write nothing
  --report <path>       write a machine-readable JSON report
  --batch-size <n>      rows per read/insert batch (default 500)
  --allow-remote        allow a libsql:// or https:// source (token from TURSO_AUTH_TOKEN)
`;

const main = async () => {
  const args = process.argv.slice(2);

  // pnpm passes the "--" of "pnpm run x -- --flag" through to the script.
  if (args[0] === "--") {
    args.shift();
  }

  const { values } = parseArgs({
    args,
    options: {
      source: { type: "string" },
      target: { type: "string" },
      orphans: { type: "string", default: "report" },
      reset: { type: "boolean", default: false },
      verify: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      report: { type: "string" },
      "batch-size": { type: "string", default: "500" },
      "allow-remote": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help || !values.source || !values.target) {
    console.log(USAGE);
    return values.help ? 0 : 2;
  }

  if (!["report", "null", "skip"].includes(values.orphans)) {
    console.error(`--orphans must be report, null or skip\n\n${USAGE}`);
    return 2;
  }

  const batchSize = Number(values["batch-size"]);

  if (!Number.isInteger(batchSize) || batchSize < 1) {
    console.error("--batch-size must be a positive integer");
    return 2;
  }

  if (values.verify && values.reset) {
    console.error("--verify only reads: it cannot be combined with --reset");
    return 2;
  }

  const options: RunOptions = {
    mode: values.verify ? "verify" : values["dry-run"] ? "dry-run" : "migrate",
    source: values.source,
    target: values.target,
    // Environment only, never an argument, so it stays out of shell history.
    authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    orphans: values.orphans as RunOptions["orphans"],
    reset: values.reset,
    allowRemote: values["allow-remote"],
    batchSize,
    reportPath: values.report,
  };

  return (await run(options)).exitCode;
};

main()
  .then((code) => {
    process.exit(code);
  })
  .catch((error: unknown) => {
    // Only the message, and never a connection string.
    console.error(
      "Unexpected error:",
      error instanceof Error ? error.message.slice(0, 200) : "unknown",
    );
    process.exit(1);
  });
