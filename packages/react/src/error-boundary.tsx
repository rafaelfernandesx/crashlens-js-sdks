import { Component as ReactComponent, ComponentType, ErrorInfo, ReactNode, useContext } from 'react';
import { CrashLensContext } from './context';
import type { CrashLensContextValue } from './context';
import type { CaptureParams } from '@crashlensorg/browser';

export interface ErrorBoundaryProps {
  fallback?: ReactNode | ((error: Error) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Tags anexadas aos erros capturados por este boundary. */
  tags?: Record<string, unknown>;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error?: Error;
}

/**
 * Captura erros de renderização dos children e os envia ao CrashLens.
 * Uso: <ErrorBoundary fallback={<FalhaUI />}><MeuComponente /></ErrorBoundary>
 */
export class ErrorBoundary extends ReactComponent<ErrorBoundaryProps, ErrorBoundaryState> {
  static contextType = CrashLensContext;
  declare context: CrashLensContextValue | null;

  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const client = this.context?.client;
    if (client) {
      client.captureException(error, {
        handled: true,
        context: 'react-error-boundary',
        tags: { ...(this.props.tags ?? {}), componentStack: errorInfo.componentStack ?? '' },
      });
    }
    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return (this.props.fallback as (error: Error) => ReactNode)(this.state.error);
      }
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}

/** HOC que envolve um componente em um ErrorBoundary. */
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  options: { fallback?: ReactNode; onError?: (error: Error, info: ErrorInfo) => void; tags?: Record<string, unknown> } = {},
): ComponentType<P> {
  function Wrapped(props: P): ReactNode {
    return (
      <ErrorBoundary fallback={options.fallback} onError={options.onError} tags={options.tags}>
        <WrappedComponent {...props} />
      </ErrorBoundary>
    );
  }
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  Wrapped.displayName = `withErrorBoundary(${displayName})`;
  return Wrapped;
}

/**
 * Hook que retorna uma função para capturar erros (ex.: em callbacks assíncronos).
 * const onSave = useErrorHandler();
 * onSave(error);
 */
export function useErrorHandler(): (error: unknown, params?: CaptureParams) => void {
  const { client } = useContextSafe();
  return (error, params) => {
    client.captureException(error, {
      handled: true,
      context: 'react-hook',
      ...(params ?? {}),
    });
  };
}

function useContextSafe(): CrashLensContextValue {
  const ctx = useContext(CrashLensContext);
  if (!ctx) {
    throw new Error('[CrashLens] useErrorHandler deve ser usado dentro de <CrashLensProvider>.');
  }
  return ctx;
}