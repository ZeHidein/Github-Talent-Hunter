import type { FC } from 'react';
import { Chat } from './Chat';

export const ChatRenderer: FC = () => {
  const configurationId = location.hostname.split('-')[0];
  return <Chat type="published" />;
};
