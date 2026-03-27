import type React from 'react';
import type { PropsWithChildren } from 'react';

export interface Props {
  children?: React.ReactNode;
}

export const MessageAsTitle = function MessageAsTitle(props: PropsWithChildren<Props>) {
  return (
    <div
      className={
        'message-as-title text-foreground font-plus-jakarta-sans font-medium text-heading-xl'
      }
    >
      {props.children}
    </div>
  );
};
