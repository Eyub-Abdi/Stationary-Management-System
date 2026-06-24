/**
 * Optional external error tracking (Sentry).
 *
 * Zero hard dependency: this seam activates ONLY when `SENTRY_DSN` is set AND
 * `@sentry/node` is installed. Otherwise every call is a no-op, so the app runs
 * unchanged out of the box. To enable in production:
 *
 *   npm install @sentry/node
 *   # set SENTRY_DSN=... in the environment
 *
 * 5xx errors are always logged with a stack + requestId by AllExceptionsFilter;
 * this additionally ships them to Sentry for alerting/aggregation when enabled.
 */

type Capture = (error: unknown, context?: Record<string, unknown>) => void;

let capture: Capture | null = null;

export function initErrorReporter(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  try {
    // Resolved at runtime; not a compile-time dependency.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? 'development',
      tracesSampleRate: 0,
    });
    capture = (error, context) =>
      Sentry.captureException(error, context ? { extra: context } : undefined);
    // eslint-disable-next-line no-console
    console.log('[observability] Sentry error reporting enabled');
  } catch {
    // @sentry/node not installed — stay a no-op.
    // eslint-disable-next-line no-console
    console.warn(
      '[observability] SENTRY_DSN is set but @sentry/node is not installed; error reporting disabled.',
    );
  }
}

/** Report a captured exception to the external sink, if configured. */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  capture?.(error, context);
}
