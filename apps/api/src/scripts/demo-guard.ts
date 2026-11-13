const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// Refuses anything that is not a local development database.
export const assertLocalDatabase = (
  url: string | undefined,
  nodeEnv: string | undefined,
) => {
  if (nodeEnv === "production") {
    throw new Error("demo:seed refuses to run with NODE_ENV=production.");
  }
  if (!url) {
    throw new Error("Missing: DATABASE_URL must be set.");
  }

  let host: string;

  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("demo:seed: DATABASE_URL is not a valid URL.");
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      "demo:seed only runs against a database on localhost; this DATABASE_URL points elsewhere.",
    );
  }
};
