import type { FC } from 'react';
import { observer } from 'mobx-react-lite';
import { useStatusStore } from '@/app/lib/hooks';

export const LoadingIndicator: FC = observer(() => {
  const statusStore = useStatusStore();
  const statusText = statusStore.text;

  if (!statusText) {
    return null;
  }

  return (
    <div id="component-placeholder" className="w-full py-3 mt-4">
      <div className="relative inline-block">
        <span className="text-foreground text-body-sm font-normal font-plus-jakarta-sans shimmer-text">
          {statusText}
        </span>
      </div>
    </div>
  );
});
