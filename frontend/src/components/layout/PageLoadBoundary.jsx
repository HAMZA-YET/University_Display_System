import { Component } from 'react';
import { ErrorState } from '../ui/States';

/** Keep navigation available when an optional page cannot load after a release. */
export default class PageLoadBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.failed && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return <ErrorState title="This page could not load" error={{ message: 'Reload to get the latest version, or use the menu to open another page.' }} onRetry={() => window.location.reload()} />;
    }
    return this.props.children;
  }
}
