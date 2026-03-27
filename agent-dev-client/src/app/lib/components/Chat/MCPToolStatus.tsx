import type { FC } from 'react';
import type { AsArgumentsProps } from '@/app/lib/types';

type Status = {
  text: string;
  isActive: boolean;
};

type Props = {
  statuses: Status[];
};

type MCPToolStatusProps = {
  argumentsProps: Props;
};

/**
 * Status indicator for MCP tool execution
 * Supports loading, success, and error states
 * Can be used both as a component (with AsArgumentsProps) and standalone
 */
export const MCPToolStatus: FC<AsArgumentsProps<Props> | MCPToolStatusProps> = ({
  argumentsProps,
}) => {
  void argumentsProps;
  // Website is now the only mode; tool status is never displayed.
  return null;
};
