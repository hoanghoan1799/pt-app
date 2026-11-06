// Shown name in chat (KAN-141, spec D2): the nickname if there is one, else
// the real name. Outside chat the real name stays.

export const resolveDisplayName = (
  nickname: string | null | undefined,
  realName: string,
) => {
  const trimmed = nickname?.trim();

  return trimmed ? trimmed : realName;
};

// Nicknames come as { targetKey: nickname }; targetKey is "user", "pt" or
// "admin:<id>".
export const displayNameFor = (
  nicknames: Readonly<Record<string, string>> | null | undefined,
  targetKey: string,
  realName: string,
) => resolveDisplayName(nicknames?.[targetKey], realName);
