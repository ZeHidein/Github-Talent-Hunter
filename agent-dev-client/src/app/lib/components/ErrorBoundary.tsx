import React, { type PropsWithChildren, type ReactNode } from 'react';

type Props = {
  fallback: ReactNode;
};
export class ErrorBoundary extends React.Component<
  PropsWithChildren<Props>,
  { hasError: boolean }
> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }
  //@ts-expect-error
  componentDidCatch(error, errorInfo) {
    //@TODO loggerService
    console.error(error, errorInfo);

    // Sentry.withScope((scope) => {
    //   scope.setExtras({
    //     source: 'error_boundary',
    //     ...(errorInfo || {}),
    //   });
    //   Sentry.captureException(error);
    // });
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children || null;
  }
}
