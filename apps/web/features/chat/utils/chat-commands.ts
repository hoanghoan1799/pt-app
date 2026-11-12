export interface ChatCommandEffects {
  // Store and publish the message as usual, but send no push notification.
  silent?: boolean;
}

export interface ChatCommand {
  name: string;
  hint: string;
  // Id of the icon the composer shows for the command (mapped to a lucide icon
  // there, so this module stays pure).
  icon?: string;
  effects: ChatCommandEffects;
}

// To add a command: append an entry here (name without the slash, a
// Vietnamese hint, its effects). A new kind of effect also needs handling
// where it applies (chat-actions.ts on the server).
export const CHAT_COMMANDS: readonly ChatCommand[] = [
  {
    name: "imlang",
    hint: "Gửi không thông báo",
    icon: "bell-off",
    effects: { silent: true },
  },
];

const COMMAND_PREFIX = /^\/([A-Za-z]+)(?=\s|$)\s*/;

const findCommand = (name: string) =>
  CHAT_COMMANDS.find((command) => command.name === name.toLowerCase()) ?? null;

export interface ParsedChatCommand {
  body: string;
  command: ChatCommand | null;
  effects: ChatCommandEffects;
}

// Only a leading `/<name>` followed by whitespace or the end counts. The
// prefix and the whitespace after it are stripped; anything else is plain text.
export const parseChatCommand = (text: string): ParsedChatCommand => {
  const match = COMMAND_PREFIX.exec(text);
  const command = match ? findCommand(match[1]) : null;

  if (!match || !command) {
    return { body: text.trim(), command: null, effects: {} };
  }
  return {
    body: text.slice(match[0].length).trim(),
    command,
    effects: command.effects,
  };
};

// Commands whose `/name` starts with what is typed, while the user is still
// typing the name (`/` plus letters, no whitespace yet).
export const matchCommandSuggestions = (text: string): ChatCommand[] => {
  if (!/^\/[A-Za-z]*$/.test(text)) {
    return [];
  }
  const typed = text.slice(1).toLowerCase();

  return CHAT_COMMANDS.filter((command) => command.name.startsWith(typed));
};

export const findCommandHint = (text: string): string | null =>
  parseChatCommand(text).command?.hint ?? null;

// Typing a known command followed by whitespace ("/imlang hi") turns it into a
// chip in the composer; `rest` is the text after it (leading whitespace gone).
export const extractLeadingCommand = (
  text: string,
): { command: ChatCommand; rest: string } | null => {
  const match = /^\/([A-Za-z]+)\s+/.exec(text);
  const command = match ? findCommand(match[1]) : null;

  return match && command
    ? { command, rest: text.slice(match[0].length) }
    : null;
};

// What the composer hands to onSend for a chip plus its text; the server and
// the hook parse it again with parseChatCommand.
export const composeCommandMessage = (command: ChatCommand, text: string) =>
  `/${command.name} ${text}`;
