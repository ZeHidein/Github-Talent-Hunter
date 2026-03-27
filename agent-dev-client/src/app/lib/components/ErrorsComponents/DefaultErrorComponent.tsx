import type { FC } from 'react';
import { CenterContentView } from '../CenterContentView';

export const DefaultErrorComponent: FC<{ error: string }> = ({ error }) => {
  return (
    <CenterContentView>
      <p>{error}</p>
    </CenterContentView>
  );
};
