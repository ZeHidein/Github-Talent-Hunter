import type { FC } from 'react';
import { CircularLoader } from './CircularLoader';

type Props = {
  size?: 'small' | 'default';
  className?: string;
};

const SIZE_MAP = {
  small: 16,
  default: 32,
} as const;

export const Loader: FC<Props> = ({ size = 'default', className = '' }) => {
  return <CircularLoader size={SIZE_MAP[size]} className={className} />;
};
