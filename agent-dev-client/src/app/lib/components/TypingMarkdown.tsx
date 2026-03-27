import React from 'react';

import { useThrottledTyping } from '../hooks/useThrottledTyping';
import Markdown from './Markdown';

const MemoizedMarkdown = React.memo(({ content }: { content: string }) => {
  return (
    <div className="prose dark:prose-invert max-w-none">
      <Markdown text={content} />
    </div>
  );
});

export const MarkdownTyper = ({ text }: { text: string }) => {
  const { displayedText } = useThrottledTyping(text, 15, 50);
  return (
    <div className="relative">
      <MemoizedMarkdown content={displayedText} />
    </div>
  );
};
