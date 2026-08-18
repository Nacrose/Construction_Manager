/**
 * Loading fallback for the (app) route group.
 *
 * Shows instantly while the route's JS chunk loads + the page's
 * data queries resolve. Without this, the browser shows nothing
 * during route transitions.
 */
export default function AppLoading() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="space-y-4 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    </div>
  );
}
