"use client";

import React, { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: 20, color: "#ff6b6b", background: "#1a1a2e", borderRadius: 8, margin: 10 }}>
          <h3>⚠️ Что-то пошло не так</h3>
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{this.state.error?.message}</pre>
          <button aria-label="action" onClick={() => this.setState({ hasError: false, error: null })}
            style={{ marginTop: 10, padding: "6px 16px", background: "#4a4a8a", border: "none", borderRadius: 4, color: "#fff", cursor: "pointer" }}
          >
            Попробовать снова
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
