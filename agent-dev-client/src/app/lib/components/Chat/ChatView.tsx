import type React from 'react';
import {
  type FC,
  useRef,
  useEffect,
  type HTMLAttributes,
  type ReactElement,
  useState,
  useLayoutEffect,
} from 'react';

import { observer } from 'mobx-react-lite';

import { cn } from '../../utils';
import { Group } from './Group';
import type { MessagesStore } from '@/app/lib/messaging/MessagesStore';
import type { MessageGroup } from '@/lib/agent-library';

type Props = {
  messages: MessageGroup[];
  userRequestPending: boolean;
  speechEnabled: boolean;
  inputPosition: 'top' | 'bottom';
  conversationInput?: ReactElement;
  containerProps?: HTMLAttributes<HTMLDivElement>;
  renderDynamicComponent: (
    componentId: string,
    props: any,
    streamingState?: { isStreaming: boolean },
  ) => React.ReactNode;
  messagesStore: MessagesStore;
};

export const ChatView: FC<Props> = observer(
  ({
    messages,
    userRequestPending,
    conversationInput,
    inputPosition,
    speechEnabled,
    containerProps = {},
    renderDynamicComponent,
    messagesStore,
  }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<HTMLDivElement>(null);
    const componentRefsRef = useRef<Map<string, HTMLDivElement>>(new Map());
    const [scrollHeight, setScrollHeight] = useState(0);
    const [footerHeight, setFooterHeight] = useState(0);
    const lastMessageCountRef = useRef(0);
    const requestCountRef = useRef(0);
    const [isInputVisible, setIsInputVisible] = useState(true);

    // Function to register component refs
    const registerComponentRef = (componentId: string, element: HTMLDivElement | null) => {
      if (element) {
        componentRefsRef.current.set(componentId, element);
      } else {
        componentRefsRef.current.delete(componentId);
      }
    };

    // Track if the input/footer is visible
    useEffect(() => {
      if (!footerRef.current) {
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          setIsInputVisible(entry.isIntersecting);
        },
        {
          threshold: 0.1, // Trigger when at least 10% is visible
        },
      );

      observer.observe(footerRef.current);

      return () => {
        observer.disconnect();
      };
    }, [conversationInput, inputPosition]);

    useLayoutEffect(() => {
      const $scroll = scrollRef.current;
      if ($scroll) {
        const offset = 62; // This offset might need review depending on layout changes
        const currentScrollHeight = $scroll.clientHeight;
        setScrollHeight(currentScrollHeight - offset);
      }
    }, [messages, scrollRef]);

    useLayoutEffect(() => {
      const updateFooterHeight = () => {
        if (!footerRef.current) {
          return;
        }
        const height = footerRef.current.getBoundingClientRect().height;
        setFooterHeight(height);
      };
      updateFooterHeight();
      const resizeObserver = new ResizeObserver(updateFooterHeight);
      if (footerRef.current) {
        // Ensure footerRef.current exists before observing
        resizeObserver.observe(footerRef.current);
      }
      window.addEventListener('resize', updateFooterHeight);
      return () => {
        window.removeEventListener('resize', updateFooterHeight);
        resizeObserver.disconnect();
      };
    }, [conversationInput]); // Re-run if conversationInput changes, as it affects footer height

    // Scroll to top when new page appears (when agent messages are cleared and rebuilt)
    useEffect(() => {
      const currentAgentMessageCount = messages.reduce(
        (count, group) => count + group.responses.length,
        0,
      );

      // If we had messages before but now have fewer agent messages, it means the page was rebuilt
      if (
        lastMessageCountRef.current > 0 &&
        currentAgentMessageCount < lastMessageCountRef.current
      ) {
        const $scroll = scrollRef.current;
        if ($scroll) {
          // Scroll to top immediately when page is rebuilt
          $scroll.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }

      lastMessageCountRef.current = currentAgentMessageCount;
    }, [messages]);

    // Scroll to updated components
    useEffect(() => {
      const componentId = messagesStore.lastUpdatedComponentId;
      if (componentId) {
        const componentElement = componentRefsRef.current.get(componentId);
        const $scroll = scrollRef.current;

        if (componentElement && $scroll) {
          // Use setTimeout to ensure the component has been rendered/updated
          setTimeout(() => {
            const elRect = componentElement.getBoundingClientRect();
            const scrollRect = $scroll.getBoundingClientRect();
            let y = elRect.top - scrollRect.top + $scroll.scrollTop;

            // Add some offset to show the component nicely in view
            y = Math.max(0, y - 100);

            $scroll.scrollTo({ top: y, behavior: 'smooth' });
          }, 100);
        }
      }
    }, [messagesStore.lastUpdatedComponentId]);

    // Scroll to user message when a new user request appears
    useEffect(() => {
      const currentRequestCount = messages.filter((group) => group.request !== null).length;

      if (currentRequestCount > requestCountRef.current) {
        const $el = containerRef.current;
        const $scroll = scrollRef.current;

        if ($el && $scroll) {
          setTimeout(() => {
            const elRect = $el.getBoundingClientRect();
            const scrollRect = $scroll.getBoundingClientRect();
            const y = elRect.top - scrollRect.top + $scroll.scrollTop;

            $scroll.scrollTo({ top: y, behavior: 'smooth' });
          }, 50);
        }
      }

      requestCountRef.current = currentRequestCount;
    }, [messages]);

    return (
      <div className={cn('w-full h-screen flex flex-col relative', containerProps.className)}>
        {/* Background - GitHub Scout Dark Tech Theme */}
        <div className="absolute inset-0 bg-background">
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'linear-gradient(rgba(56,189,120,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,120,0.3) 1px, transparent 1px)',
            backgroundSize: '40px 40px'
          }}></div>
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-chart-2/[0.03]"></div>
        </div>

        {/* Content Layer */}
        <div className="relative z-10 w-full h-full flex flex-col">
          {/* ----------------------- Optional header input ----------------------- */}
          <div
            ref={headerRef}
            className={cn(
              conversationInput && inputPosition === 'top' && 'z-20 pointer-events-none',
              !conversationInput && 'hidden',
            )}
          >
            {inputPosition === 'top' && (
              <div
                className={cn('container mx-auto max-w-[var(--main-col-w)] pt-4 pb-2 px-6 xl:px-0')}
              >
                {conversationInput}
              </div>
            )}
          </div>

          {/* --------------------------- Messages area --------------------------- */}
          <div
            ref={scrollRef}
            className="w-full h-full overflow-y-auto flex flex-col min-h-0 scrollbar scrollbar-none outline-0 pb-4"
          >
            {Boolean(messages.length) && (
              <div
                className={cn(
                  'w-full flex p-1 sm:p-2 flex-col flex-1 max-w-[var(--main-col-w)] mx-auto',
                )}
              >
                <Group
                  messages={messages}
                  userRequestPending={userRequestPending}
                  renderDynamicComponent={renderDynamicComponent}
                  ref={containerRef}
                  scrollHeight={scrollHeight}
                  registerComponentRef={registerComponentRef}
                  lastUpdatedComponentId={messagesStore.lastUpdatedComponentId}
                  lastPopulatedComponentId={messagesStore.lastPopulatedComponentId}
                />
              </div>
            )}
          </div>

          {/* Floating overlay input - rendered outside of scroll container */}
          {inputPosition === 'bottom' && conversationInput && (
            <div ref={footerRef} className="pointer-events-none">
              {conversationInput}
            </div>
          )}
        </div>
      </div>
    );
  },
);
