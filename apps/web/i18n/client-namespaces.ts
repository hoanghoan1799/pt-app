// Namespaces that browser code reads through the useTranslations hook. The root
// layout sends only these to NextIntlClientProvider, so the page payload does
// not carry the rest (server-only texts such as errors, push and format).
// i18n/__tests__/client-namespaces.test.ts scans the source and fails when a
// component uses a namespace that is missing here.
export const CLIENT_NAMESPACES = [
  "auth",
  "avatar",
  "chat",
  "common",
  "dashboard",
  "foods",
  "layout",
  "mealPlans",
  "members",
  "nutrition",
  "pages",
  "pts",
  "pwa",
  "restrictions",
  "social",
  "workouts",
] as const;

const CLIENT_NAMESPACE_SET: ReadonlySet<string> = new Set(CLIENT_NAMESPACES);

// Keeps only the client namespaces of a { namespace: messages } object.
export const pickClientMessages = <T extends Record<string, unknown>>(
  messages: T,
): Partial<T> =>
  Object.fromEntries(
    Object.entries(messages).filter(([namespace]) =>
      CLIENT_NAMESPACE_SET.has(namespace),
    ),
  ) as Partial<T>;
