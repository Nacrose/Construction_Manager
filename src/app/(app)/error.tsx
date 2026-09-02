"use client";

/**
 * Group-level error boundary for the whole (app) route group.
 *
 * Previously only 5 of ~90 routes had an error.tsx, so an uncaught render
 * error in finance, HR, IPC, gantt, etc. fell through to Next's default
 * error screen. This boundary catches render errors for every page under
 * (app) while keeping the user inside the shell (sidebar intact), with a
 * retry that re-renders the failed segment.
 */
export default function AppGroupError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">
        This section failed to render. Your data was not changed — try again, or
        navigate elsewhere and come back.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70 mt-2 font-mono">
          Error ref: {error.digest}
        </p>
      ) : null}
      <button
        onClick={reset}
        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
      >
        Try again
      </button>
    </div>
  );
}
