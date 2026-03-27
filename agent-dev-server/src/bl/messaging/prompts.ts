import dedent from 'dedent';
import type { MemoryEntry } from '../../types';

const MAX_MEMORY_ITEMS = 15;

const createMemoryPrompt = (memories: MemoryEntry[]) => {
  if (!memories || memories.length === 0) {
    return '';
  }

  // Sort by timestamp and take only the last N memories to avoid overwhelming the prompt
  const recentMemories = [...memories]
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_MEMORY_ITEMS);

  const memoryItems = recentMemories
    .map((m) => {
      const date = new Date(m.timestamp).toLocaleDateString();
      return `- ${m.summary} (saved on ${date})`;
    })
    .join('\n');

  return dedent`
    <user_memory_bank>
    The following information has been remembered about the user from previous conversations.
    Use this context to personalize your responses and provide a more tailored experience:
    
    ${memoryItems}
    </user_memory_bank>
  `;
};

export const createRealtimePrompt = (
  instruction: string,
  renderedMessages: string,
  memories: MemoryEntry[] = [],
) => dedent`
  ${instruction}
  ${createMemoryPrompt(memories)}
`;
