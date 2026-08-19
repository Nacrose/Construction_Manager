"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <h2 className="text-lg font-semibold text-destructive">Something went wrong</h2>
      <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
      <button onClick={reset} className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">
        Try again
      </button>
    </div>
  );
}
