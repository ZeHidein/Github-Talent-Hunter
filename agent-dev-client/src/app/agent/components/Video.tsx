import type React from 'react';
import { useEffect, useReducer, useState } from 'react';
import { registerComponent } from '@/app/lib/components/registry';
import type { AsArgumentsProps, ComponentConfigT } from '@/app/lib/types';
import { cn } from '@/app/lib/utils';
import ReactPlayer from 'react-player';
import { LoaderBlocker } from '@/app/lib/components/Loader';
import { TextGenerateEffect } from '../shadcdn/text-generate-effect';

const config: ComponentConfigT = {
  type: 'component',
  isStreaming: true,
  componentName: 'Video',
  name: 'Video',
  description: 'Card component that represents video with controls and title',
  isStrictSchema: false,
  parameters: {
    type: 'object',
    properties: {
      src: {
        type: 'string',
        description: 'URL of the video',
      },
      title: {
        type: 'string',
        description: 'Title of the card that is shown as large text',
      },
      poster: {
        type: 'string',
        description: 'URL for video poster',
      },
    },
    additionalProperties: false,
    required: ['src'],
  },
};

type VideoProps = {
  title?: string;
  src: string;
  poster?: string;
};

type VideoPlayerStateT = {
  src: string;
  pip: boolean;
  playing: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
};

type ActionT = {
  type: string;
  payload: any;
};

function reducer(state: VideoPlayerStateT, action: ActionT) {
  switch (action.type) {
    case 'SET_PLAYING':
      return { ...state, playing: action.payload };
    case 'SET_PIP':
      return { ...state, pip: action.payload };
    case 'SET_PLAYBACK_RATE':
      return { ...state, playbackRate: action.payload };
    default:
      throw new Error(`Unhandled action type: ${action.type}`);
  }
}

const VideoComponent: React.FC<AsArgumentsProps<VideoProps>> = ({ argumentsProps }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const { title, src, poster } = argumentsProps;

  const [state, dispatch] = useReducer(reducer, {
    src: src,
    pip: false,
    playing: false,
    volume: 0.8,
    muted: true,
    playbackRate: 1.0,
  });

  useEffect(() => {
    if (!src?.length) {
      setIsError(true);
    }
  }, [src]);

  const handleOnReady = (player: ReactPlayer): void => {
    setIsLoading(false);
  };

  const handlePlay = (): void => {
    dispatch({ type: 'SET_PLAYING', payload: true });
  };

  const handleEnablePIP = (): void => {
    dispatch({ type: 'SET_PIP', payload: true });
  };

  const handleDisablePIP = (): void => {
    dispatch({ type: 'SET_PIP', payload: false });
  };

  const handlePause = (): void => {
    dispatch({ type: 'SET_PLAYING', payload: false });
  };

  const handleOnError = (error: any, data?: any, hlsInstance?: any, hlsGlobal?: any): void => {
    setIsError(true);
  };

  const handleOnPlaybackRateChange = (speed: string) => {
    dispatch({ type: 'SET_PLAYBACK_RATE', payload: parseFloat(speed) });
  };

  const getPlaceholder = () => {
    if (isLoading && poster) {
      return (
        <img
          src={poster}
          alt="Video placeholder"
          className="absolute inset-0 w-full h-full object-cover rounded-md z-10"
        />
      );
    } else if (isLoading) {
      return <LoaderBlocker />;
    }
  };

  return (
    <section
      className={cn(
        'w-full max-w-container-xl flex justify-center items-center rounded-lg bg-card overflow-hidden',
        'p-[20px] md:p-[50px_80px_90px]',
      )}
    >
      <main className="flex flex-col items-center w-full max-w-container-lg md:max-w-full">
        <header className="flex flex-col justify-start items-center w-full max-w-container-content">
          {title && (
            <TextGenerateEffect
              words={title}
              className="text-primary mb-6 text-heading-xl font-bold tracking-tight text-center font-plus-jakarta-sans max-w-container-content w-full"
              duration={0.25}
              filter={true}
            />
          )}
        </header>
        {isError && (
          <div className="h-full w-full flex justify-center items-center mx-20">
            <div>
              <p className="break-words break-all text-left font-source-sans-pro font-medium text-heading-lg text-secondary/80">
                Unfortunately, we could not load video from{' '}
                <a
                  href={state.src}
                  className="text-link hover:text-link-hover underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {state.src}
                </a>
                . Possible reasons:
              </p>
              <ul className="list-disc list-inside mt-2 text-left font-source-sans-pro font-medium text-heading-lg text-secondary/80">
                <li>Empty or incorrect URL</li>
                <li>Unsupported format</li>
                <li>It's unavailable due to privacy settings, streaming permissions, etc.</li>
              </ul>
            </div>
          </div>
        )}
        {!isError && (
          <div className="relative flex justify-center items-center w-full h-full backdrop-blur-[12px] rounded-lg">
            <div className="relative z-10 flex justify-center items-center w-full h-full overflow-hidden rounded-md">
              <div className="player-wrapper w-full aspect-video h-full relative">
                {getPlaceholder()}
                <div className={cn(isLoading && 'invisible', 'visible h-full w-full')}>
                  <ReactPlayer
                    width="100%"
                    height="100%"
                    url={state.src}
                    pip={state.pip}
                    playing={state.playing}
                    controls={true}
                    light={false}
                    loop={false}
                    playbackRate={state.playbackRate}
                    volume={state.volume}
                    muted={state.muted}
                    onReady={handleOnReady}
                    onPlay={handlePlay}
                    onEnablePIP={handleEnablePIP}
                    onDisablePIP={handleDisablePIP}
                    onPause={handlePause}
                    onPlaybackRateChange={handleOnPlaybackRateChange}
                    onError={handleOnError}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </section>
  );
};

export default registerComponent(config)(function Video(props: AsArgumentsProps<VideoProps>) {
  return <VideoComponent {...props} />;
});
