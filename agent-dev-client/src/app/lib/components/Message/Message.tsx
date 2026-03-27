import { FC, type PropsWithChildren } from 'react';

import type { MessageTypeT } from './types';
import { MessageBubble } from './MessageBubble';
import { cn } from '../../utils';
import { MessageAsTitle } from './MessageAsTitle';

/*
  If isBubble render user message bubble, otherwise render message as title
*/
type Props = {
  type: MessageTypeT;
  isBubble?: boolean;
};

export const Message = function Message(props: PropsWithChildren<Props>) {
  return (
    <div className="w-full">
      {props.isBubble && (
        <MessageBubble
          noStyle={true}
          type={props.type}
          className={cn(
            'p-3 rounded-[15px_15px_2px_15px]',
            'font-plus-jakarta-sans font-normal',
            'text-[16px] leading-[28px]',
            'bg-[var(--user-message-bg-color)] text-primary',
          )}
        >
          {props.children}
        </MessageBubble>
      )}

      {!props.isBubble && <MessageAsTitle>{props.children}</MessageAsTitle>}
    </div>
  );
};
