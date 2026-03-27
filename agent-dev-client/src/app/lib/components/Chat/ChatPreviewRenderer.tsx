import type { FC } from 'react';
import { Chat } from './Chat';
import { useParams } from 'react-router-dom';
import type { AgentConfigurationType } from '@/app/lib/types/components';

export const ChatPreviewRenderer: FC = () => {
  const { type = 'published' } = useParams();
  return <Chat type={type as AgentConfigurationType} />;
};
