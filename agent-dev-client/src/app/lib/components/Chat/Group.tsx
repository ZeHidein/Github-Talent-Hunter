import { forwardRef, Fragment, type ReactNode } from 'react';
import { MessageComponent } from './Message';
import { LoadingIndicator } from './LoadingIndicator';
import { observer } from 'mobx-react-lite';
import { ContentType, type AgentContent, type MessageGroup } from '@/lib/agent-library';

type Props = {
  messages: MessageGroup[];
  userRequestPending?: boolean;
  scrollHeight: number;
  renderDynamicComponent: (
    componentId: string,
    props: any,
    streamingState?: { isStreaming: boolean },
  ) => ReactNode;
  registerComponentRef: (componentId: string, element: HTMLDivElement | null) => void;
  lastUpdatedComponentId?: string | null;
  lastPopulatedComponentId?: string | null;
};

const checkIsMessageRenderable = (message: AgentContent) => {
  if (message.type === ContentType.Tool) {
    return false;
  }
  return true;
};

const checkIsGroupRenderable = (group: MessageGroup) => {
  const isRequestRenderable = group.request && checkIsMessageRenderable(group.request);
  const hasRenderableResponses = group.responses.some((m) => checkIsMessageRenderable(m));
  return isRequestRenderable || hasRenderableResponses;
};

const Component = forwardRef<HTMLDivElement, Props>(
  (
    {
      messages,
      userRequestPending,
      scrollHeight,
      renderDynamicComponent,
      registerComponentRef,
      lastUpdatedComponentId,
      lastPopulatedComponentId,
    },
    ref,
  ) => {
    return (
      <Fragment>
        {messages.map((group, i) => {
          const isLastGroup = i === messages.length - 1;
          const isGroupRenderable = checkIsGroupRenderable(group);
          const isRequestRenderable = group.request && checkIsMessageRenderable(group.request);

          // Only render the group if it has renderable content
          if (!isGroupRenderable) {
            return null;
          }

          const minHeight = isLastGroup && scrollHeight ? `${scrollHeight}px` : 'auto';

          return (
            <div
              key={i}
              style={{ minHeight }}
              className={'first:mt-4 not-last:pb-12 pb-4 px-2 md:px-6 xl:px-0 max-w-(--main-col-w)'}
            >
              {Boolean(group.request) && isRequestRenderable && (
                <MessageComponent
                  ref={isLastGroup ? ref : null}
                  message={group.request as AgentContent}
                  renderDynamicComponent={renderDynamicComponent}
                  registerComponentRef={registerComponentRef}
                  lastUpdatedComponentId={lastUpdatedComponentId}
                  lastPopulatedComponentId={lastPopulatedComponentId}
                />
              )}
              {group.responses
                .filter((m) => checkIsMessageRenderable(m))
                .map((message) => (
                  <MessageComponent
                    key={message.messageId}
                    message={message as AgentContent}
                    renderDynamicComponent={renderDynamicComponent}
                    registerComponentRef={registerComponentRef}
                    lastUpdatedComponentId={lastUpdatedComponentId}
                    lastPopulatedComponentId={lastPopulatedComponentId}
                  />
                ))}
              {isLastGroup && userRequestPending && <LoadingIndicator />}
            </div>
          );
        })}
      </Fragment>
    );
  },
);

export const Group = observer(Component);
