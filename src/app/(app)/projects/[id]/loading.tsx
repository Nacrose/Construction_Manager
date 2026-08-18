/**
 * Loading fallback for project detail pages.
 *
 * Shows instantly when navigating into a project (e.g., from
 * /projects to /projects/[id]) while the page chunk loads.
 */
export default function ProjectLoading() {
  return (
    <div className="space-y-6 p-6">
      <div className="h-8 w-64 shimmer rounded bg-muted" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 shimmer rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-96 shimmer rounded-lg bg-muted" />
    </div>
  );
}
