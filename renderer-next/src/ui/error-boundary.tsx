import { Component, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Last-resort boundary: renders the crash text on screen instead of a blank
 * window, so field issues can be reported verbatim by the user.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error): void {
    // Surface in DevTools console as well for copy/paste reporting.
    console.error("[workbench-crash]", error);
  }

  render(): ReactNode {
    if (this.state.error !== null) {
      const { error } = this.state;
      return (
        <div className="crash-screen" role="alert">
          <h2>界面遇到错误</h2>
          <p className="crash-screen__hint">
            请把下面的文字完整截图或复制发给开发者。
          </p>
          <pre className="crash-screen__detail">{`${error.message}\n\n${error.stack ?? ""}`}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
