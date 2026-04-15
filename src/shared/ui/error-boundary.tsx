import { Box, Text } from 'ink';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logger } from '../logging/logger.js';

type Props = { children: ReactNode };

type State = { error: Error | null };

/** Catches render-phase exceptions in the React tree. Logs them and shows a
 * minimal recovery screen so the terminal stays usable until the user exits. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('ui', 'render crash', {
      message: error.message,
      stack: error.stack,
      component: info.componentStack,
    });
  }

  override render(): ReactNode {
    const err = this.state.error;
    if (!err) return this.props.children;
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="red" bold>
          orco crashed
        </Text>
        <Box marginTop={1}>
          <Text color="red">{err.message}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>press ctrl+c to exit · set ORCO_LOG=debug and relaunch for details</Text>
        </Box>
      </Box>
    );
  }
}
