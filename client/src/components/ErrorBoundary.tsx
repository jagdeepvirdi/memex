import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
          <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mb-8">
            <AlertTriangle size={40} />
          </div>
          <h1 className="font-display text-3xl text-ink mb-4">Something went wrong</h1>
          <p className="text-ink-muted max-w-md mb-12">
            The intelligence engine encountered an unexpected error. Don't worry, your data is safe.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => window.location.reload()}
              className="bg-accent text-bg px-6 py-2.5 rounded-lg font-bold flex items-center gap-2"
            >
              <RefreshCw size={18} />
              Retry Session
            </button>
            <a 
              href="/"
              className="bg-white/5 text-ink px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 border border-white/5"
            >
              <Home size={18} />
              Return Home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
