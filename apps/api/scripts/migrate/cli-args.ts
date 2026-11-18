// pnpm passes the "--" of "pnpm run x -- --flag" through to the script. It is
// not always first: data:verify is "tsx migrate-from-turso.ts --verify", so
// "pnpm data:verify -- --source ..." reaches the script as
// ["--verify", "--", "--source", ...]. The script takes no positional
// arguments, so the first "--" is dropped wherever it is (parseArgs would
// otherwise treat everything after it as positionals and reject them).
export const withoutPnpmSeparator = (args: readonly string[]): string[] => {
  const index = args.indexOf("--");

  if (index === -1) {
    return [...args];
  }

  return [...args.slice(0, index), ...args.slice(index + 1)];
};
