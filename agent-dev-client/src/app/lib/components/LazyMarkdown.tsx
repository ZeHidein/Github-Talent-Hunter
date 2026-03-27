// LazyMarkdown.tsx
import React, { Suspense } from 'react';

const Markdown = React.lazy(() => import('./Markdown'));

type Props = {
  text: string;
};

export const LazyMarkdown: React.FC<Props> = ({ text = '', ...rest }) => (
  <Suspense fallback={<small>Loading...</small>}>{text && <Markdown text={text} />}</Suspense>
);
