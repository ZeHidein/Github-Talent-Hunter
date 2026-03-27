import type { ReactNode } from 'react';
import { ErrorBoundary } from '../ErrorBoundary';
import { CenterContentView } from '../CenterContentView';
import { CircularLoader } from '../Loader';
import { AgentNotFoundComponent } from '../ErrorsComponents/AgentNotFoundComponent';
import { DefaultErrorComponent } from '../ErrorsComponents/DefaultErrorComponent';
import { AgentNotFoundError, GenericError } from '@/app/lib/errors';

const DEFAULT_ERROR_MESSAGE = 'Oops... something went wrong 😔, please try again later.';

type Props<T> = {
  data: T;
  children: (props: T) => ReactNode;
  loading: boolean;
  error?: Error | string;
};

export const OptimisticStateMachineRenderer: <T>(props: Props<T>) => ReactNode = ({
  data,
  children,
  loading,
  error,
}) => {
  const getRenderedError = (_error: Error | string) => {
    if (typeof _error === 'string') {
      return <DefaultErrorComponent error={_error} />;
    } else if (error instanceof AgentNotFoundError) {
      return <AgentNotFoundComponent />;
    } else if (error instanceof GenericError) {
      return <DefaultErrorComponent error={_error.message} />;
    }
  };

  return (
    <div className="h-full relative">
      <ErrorBoundary fallback={DEFAULT_ERROR_MESSAGE}>
        {data && children(data)}
        {!data && loading && (
          <CenterContentView>
            <CircularLoader />
          </CenterContentView>
        )}
        {error && getRenderedError(error)}
      </ErrorBoundary>
    </div>
  );
};
