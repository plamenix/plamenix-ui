import { Component, type ErrorInfo, type ReactNode } from 'react';
import { getLogger } from './log/index.js';

/**
 * Catches a render error instead of letting it blank the app.
 *
 * Without one, any uncaught error thrown during render or in a mount
 * effect unmounts the entire React root. The user sees a white page,
 * every open tab's in-memory state is gone, and nothing says why. That
 * was not hypothetical: until the BLOB renderer moved to shell boot, a
 * two-statement script mounted two result tables and the second one's
 * registration threw, taking the whole application with it.
 *
 * Fixing that particular throw does not make a boundary unnecessary.
 * The point of one is the errors nobody predicted.
 *
 * ## What it deliberately does not do
 *
 * It does not swallow. The error is logged through the shell's sink, so
 * it reaches wherever that shell sends logs, and it is shown to the
 * user rather than hidden behind a generic apology — a message the user
 * can read is a message they can report.
 *
 * It does not reset itself on a timer or retry automatically. A render
 * error usually recurs on the next render with the same state; a
 * boundary that retried would flicker between the error and the crash.
 * Recovery is a button, so the user chooses when.
 */

const log = getLogger('error-boundary');

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Rendered instead of the children once an error is caught.
   *
   * `reset` clears the caught error and re-renders the children. It
   * recovers when the cause was transient — a stale prop, a bad row in
   * a result now replaced — and reproduces the error when it was not.
   */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called for every caught error, after logging. For a shell that
   *  wants to report crashes somewhere of its own. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // The component stack is the useful half — it names the subtree
    // that failed, which the message on its own does not.
    log.error('a render error was caught', {
      message: error.message,
      componentStack: info.componentStack,
    });
    this.props.onError?.(error, info);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 bg-canvas p-8 text-center"
      >
        <p className="text-sm font-medium text-fg">Something in the interface stopped working.</p>
        <p className="max-w-lg font-mono text-xs text-fg-muted">{error.message}</p>
        <p className="max-w-lg text-xs text-fg-subtle">
          Your connections and open tabs are unaffected. Reloading the view usually clears it; if
          it comes back, the message above is worth reporting.
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="rounded-md border border-edge px-3 py-1 text-xs text-fg-muted transition-colors hover:bg-elevated hover:text-fg"
        >
          Reload the view
        </button>
      </div>
    );
  }
}
