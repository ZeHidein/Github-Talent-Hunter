import type { ActionLogEntry } from './action-log';

const MAX_ACTION_LOG_CHARS = 3000;

export function formatActionLogBlock(entries: ActionLogEntry[]): string {
  if (entries.length === 0) return '';

  let lines = entries.map((a) => `- ${a.summary}${a.data ? ` [${JSON.stringify(a.data)}]` : ''}`);

  // Truncation guard — keep most recent entries that fit
  const totalLen = lines.reduce((sum, l) => sum + l.length + 1, 0);
  if (totalLen > MAX_ACTION_LOG_CHARS) {
    let budget = MAX_ACTION_LOG_CHARS - 80;
    let kept = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (budget - lines[i].length < 0) break;
      budget -= lines[i].length;
      kept++;
    }
    const skipped = lines.length - kept;
    lines = [`(... and ${skipped} earlier actions)`, ...lines.slice(-kept)];
  }

  return [
    '<actions_since_last_message>',
    'The user performed the following actions via the UI since your last interaction:',
    ...lines,
    '</actions_since_last_message>',
  ].join('\n');
}
