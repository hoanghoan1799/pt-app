import { SOCIAL_REACTION_SUMMARY_TOP } from "@pt/contracts";

export type ReactionSummary = {
  counts: { emoji: string; count: number }[];
  total: number;
  mine: string | null;
};

export const EMPTY_REACTIONS: ReactionSummary = {
  counts: [],
  total: 0,
  mine: null,
};

// Reaction rows -> the line under a post: top emoji, total, and my own.
export const summarizeReactions = (
  reactions: { reactorKey: string; emoji: string }[],
  myKey: string,
): ReactionSummary => {
  const byEmoji = new Map<string, number>();
  let mine: string | null = null;

  for (const reaction of reactions) {
    byEmoji.set(reaction.emoji, (byEmoji.get(reaction.emoji) ?? 0) + 1);
    if (reaction.reactorKey === myKey) {
      mine = reaction.emoji;
    }
  }
  const counts = [...byEmoji.entries()]
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count);

  return {
    counts: counts.slice(0, SOCIAL_REACTION_SUMMARY_TOP),
    total: reactions.length,
    mine,
  };
};
