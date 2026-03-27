import type React from 'react';
import { type HTMLAttributes, type DetailedHTMLProps, useState } from 'react';

import ReactMarkdown from 'react-markdown';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { ErrorBoundary } from 'react-error-boundary';

type Props = {
  text: string;
  className?: string;
};

const rehypePlugins = [rehypeRaw];
const remarkPlugins = [remarkParse, remarkRehype, remarkGfm];

const LinkRenderer = (props: HTMLAttributes<HTMLAnchorElement>) => {
  return (
    <a
      {...props}
      className="text-link hover:text-link-hover underline break-words break-all"
      target="_blank"
    />
  );
};

const ImageRenderer = (
  props: DetailedHTMLProps<HTMLAttributes<HTMLImageElement>, HTMLImageElement> & {
    src?: string;
    alt?: string;
  },
) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <span className="block my-4">
      <span className="relative block overflow-hidden">
        <img
          {...props}
          className="w-full h-auto rounded border border-border"
          onLoad={() => setIsLoaded(true)}
          style={{
            clipPath: isLoaded ? 'none' : 'inset(0 0 100% 0)',
            animation: isLoaded ? 'none' : 'imageRevealMarkdown 1.5s ease-out forwards',
          }}
        />
        {!isLoaded && (
          <span
            className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-transparent via-primary to-transparent"
            style={{
              animation: 'scanLineMarkdown 1.5s ease-out forwards',
              boxShadow: '0 0 10px hsl(var(--primary) / 0.8)',
            }}
          />
        )}
      </span>
      <style>{`
        @keyframes imageRevealMarkdown {
          0% {
            clip-path: inset(0 0 100% 0);
          }
          100% {
            clip-path: inset(0 0 0% 0);
          }
        }

        @keyframes scanLineMarkdown {
          0% {
            top: 0;
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
      `}</style>
    </span>
  );
};

export const Markdown: React.FC<Props> = ({ text, className }) => {
  return (
    <ErrorBoundary
      onError={(error) => {
        console.error(error);
      }}
      fallback={<p className="text-foreground">{text}</p>}
    >
      <article className="markdown prose prose-zinc prose-invert w-full max-w-full text-foreground">
        <ReactMarkdown
          components={{
            a: LinkRenderer,
            img: ImageRenderer,
          }}
          rehypePlugins={rehypePlugins}
          remarkPlugins={remarkPlugins}
          className={className}
        >
          {text || ''}
        </ReactMarkdown>
      </article>
    </ErrorBoundary>
  );
};

export default Markdown;
