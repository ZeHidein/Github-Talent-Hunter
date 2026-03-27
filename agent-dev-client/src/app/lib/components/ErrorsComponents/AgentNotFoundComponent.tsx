import type { FC } from 'react';
import { CenterContentView } from '../CenterContentView';

export const AgentNotFoundComponent: FC = () => {
  return (
    <CenterContentView>
      <div className="text-center">
        <h1 className="text-2xl flex-center mb-2">⚠️ Agent Not Found</h1>
        <p className="text-base">
          The agent you are looking for could not be found or hasn't been published yet. Please
          check the details and try again.
        </p>
      </div>
    </CenterContentView>
  );
};
