import { forwardRef, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { observer } from 'mobx-react-lite';

import { ContentType, type AgentContent, type ComponentContent } from '@/lib/agent-library';

import { MessageContainer } from './MessageContainer';
import { FileWaveform } from './FileWaveform';
import { Message } from '../Message';
import { TextInCardInline } from './TextInCardInline';

type Props = {
  message: AgentContent;
  renderDynamicComponent: (
    componentId: string,
    props: any,
    streamingState?: { isStreaming: boolean },
  ) => React.ReactNode;
  registerComponentRef: (componentId: string, element: HTMLDivElement | null) => void;
  lastUpdatedComponentId?: string | null;
  lastPopulatedComponentId?: string | null;
};

const UserMessage = observer(
  forwardRef<HTMLDivElement, Props>(({ message }, ref) => {
    const id = message.messageId;

    if (message.hidden) {
      return null;
    }

    if (message.type === ContentType.Audio) {
      return (
        <MessageContainer key={id} ref={ref}>
          <FileWaveform data={(message.content as { data: string }).data} />
        </MessageContainer>
      );
    }

    const displayText = message.type === ContentType.Text ? message.content : '';
    if (!displayText || !displayText.trim()) {
      return null;
    }

    return (
      <MessageContainer key={id} ref={ref}>
        <Message type="outgoing" isBubble key={id}>
          {displayText}
        </Message>
      </MessageContainer>
    );
  }),
);

const AgentMessage = observer(
  forwardRef<HTMLDivElement, Props>(
    (
      {
        message,
        renderDynamicComponent,
        registerComponentRef,
        lastUpdatedComponentId,
        lastPopulatedComponentId,
      },
      ref,
    ) => {
      const id = message.messageId;
      const internalRef = useRef<HTMLDivElement | null>(null);
      const [isUpdated, setIsUpdated] = useState(false);

      // Register the component ref for scrolling
      useEffect(() => {
        if (message.type === ContentType.Component && internalRef.current) {
          registerComponentRef(id, internalRef.current);
        }

        // Cleanup function to unregister the ref
        return () => {
          if (message.type === ContentType.Component) {
            registerComponentRef(id, null);
          }
        };
      }, [id, message.type, registerComponentRef]);

      // Track when this component is populated (for denoising effect)
      useEffect(() => {
        if (lastPopulatedComponentId === id && message.type === ContentType.Component) {
          setIsUpdated(true);
        }
      }, [lastPopulatedComponentId, id, message.type]);

      const handleAnimationComplete = () => {
        setIsUpdated(false);
      };

      if (message.type === ContentType.Component) {
        const component = message as ComponentContent;
        const props = component.props || {};
        const componentId = component.componentName || '';
        return (
          <MessageContainer
            key={id}
            ref={(node) => {
              // Handle internal ref
              internalRef.current = node;
              // Forward the ref
              if (typeof ref === 'function') {
                ref(node);
              } else if (ref) {
                (ref as MutableRefObject<HTMLDivElement | null>).current = node;
              }
            }}
            isUpdated={isUpdated}
            onAnimationComplete={handleAnimationComplete}
          >
            {renderDynamicComponent(componentId, props, {
              isStreaming: !!(
                component.streaming &&
                component.streaming.state !== 'output-available' &&
                component.streaming.state !== 'output-error'
              ),
            })}
          </MessageContainer>
        );
      }

      // Render text content as TextInCard (skip reasoning)
      if (message.type === ContentType.Text) {
        const isReasoning = (message as { isReasoning?: boolean }).isReasoning;
        if (isReasoning) {
          return null;
        }
        const textContent = message.content as string;
        if (!textContent || !textContent.trim()) {
          return null;
        }
        return (
          <MessageContainer key={id} ref={ref}>
            <TextInCardInline text={textContent} />
          </MessageContainer>
        );
      }

      return null;
    },
  ),
);

export const MessageComponent = observer(
  forwardRef<HTMLDivElement, Props>(
    (
      {
        message,
        renderDynamicComponent,
        registerComponentRef,
        lastUpdatedComponentId,
        lastPopulatedComponentId,
      },
      ref,
    ) => {
      if (message.type === ContentType.Tool) {
        return null;
      }

      if (message.role !== 'user') {
        return (
          <AgentMessage
            message={message}
            renderDynamicComponent={renderDynamicComponent}
            registerComponentRef={registerComponentRef}
            lastUpdatedComponentId={lastUpdatedComponentId}
            lastPopulatedComponentId={lastPopulatedComponentId}
            ref={ref}
          />
        );
      }
      return (
        <UserMessage
          message={message}
          ref={ref}
          renderDynamicComponent={renderDynamicComponent}
          registerComponentRef={registerComponentRef}
          lastUpdatedComponentId={lastUpdatedComponentId}
          lastPopulatedComponentId={lastPopulatedComponentId}
        />
      );
    },
  ),
);
