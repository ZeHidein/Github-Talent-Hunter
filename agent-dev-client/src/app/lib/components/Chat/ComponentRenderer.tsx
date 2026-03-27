import type { FC, ReactElement } from 'react';

import type { ConversationInputProps, PlainObject, SendMessagePropsT } from '@/app/lib/types';

import { ErrorBoundary } from 'react-error-boundary';

import type { FileReadingService, FileUploadService } from '@/app/lib/services';

import type { UIServicesContainerI } from '@/app/lib/types';

import { Card, Skeleton } from '../../../agent/shadcdn';

type ComponentRendererProps = {
  componentId: string;
  props: PlainObject;
  isStreaming?: boolean;
  sendMessage: (s: SendMessagePropsT) => void;
  renderConversationInput: (props?: Partial<ConversationInputProps>) => ReactElement | null;
  services: {
    fileUploadService: FileUploadService;
    fileReadingService: FileReadingService;
  };
  components: Record<string, FC<any>>;
};

const StreamingSkeleton: FC<{ error: any }> = () => {
  return (
    <div className="w-full max-w-3xl mx-auto bg-card/30 p-5">
      <div className="flex flex-col gap-4">
        {/* Mock header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-4 w-32 rounded-md" />
        </div>

        {/* Mock content body */}
        <Skeleton className="h-[120px] w-full rounded-lg" />
      </div>
    </div>
  );
};

const ErrorFallback: FC<{ error: any }> = ({ error }) => {
  return (
    <Card className="py-[30px] lg:py-[60px] px-[45px] lg:px-[90px] max-w-container-xl">
      {error?.message}
    </Card>
  );
};

export const ComponentRenderer: FC<ComponentRendererProps> = ({
  componentId,
  props,
  isStreaming,
  sendMessage,
  renderConversationInput,
  services,
  components,
}) => {
  const staticComponentAvailable = components[componentId];

  const { fileReadingService, fileUploadService } = services;

  const injectedServices: UIServicesContainerI = {
    fileReadingService,
    fileUploadService,
  };

  const CMP = staticComponentAvailable;
  if (!CMP) {
    return null;
  }

  return (
    <ErrorBoundary
      FallbackComponent={isStreaming ? StreamingSkeleton : ErrorFallback}
      resetKeys={[JSON.stringify(props)]}
      onError={(error) => {
        console.error(error);
      }}
    >
      <CMP
        argumentsProps={props || {}}
        handleSendMessage={sendMessage}
        services={injectedServices}
        renderConversationInput={renderConversationInput}
      />
    </ErrorBoundary>
  );
};
