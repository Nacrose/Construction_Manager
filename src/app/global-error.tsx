"use client";

/**
 * Root global error boundary — last resort when even the root layout
 * throws (e.g. a provider crash). Next.js requires this component to
 * render its own <html> and <body>. Kept dependency-free on purpose:
 * if the global boundary itself needs the app's providers to render,
 * it cannot do its job.
 *
 * Logs the error so Sentry's client integration (enabled when a DSN is
 * configured) can capture it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof window !== "undefined") {
    console.error("[global-error]", error);
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: 14, color: "#475569", margin: 0 }}>
          The application hit an unexpected error. Reload the page to continue.
        </p>
        {error.digest ? (
          <p style={{ fontSize: 12, color: "#94a3b8", margin: 0, fontFamily: "monospace" }}>
            Error ref: {error.digest}
          </p>
        ) : null}
        <button
          onClick={reset}
          style={{
            marginTop: 8,
            padding: "8px 16px",
            borderRadius: 6,
            border: "none",
            background: "#0f172a",
            color: "#ffffff",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </body>
    </html>
  );
}
