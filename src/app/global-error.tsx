"use client";

/**
 * The last resort.
 *
 * Every other error boundary renders inside the root layout. This one replaces it,
 * which is why it carries its own `<html>` and `<body>` — it is what shows when the
 * layout itself is what broke, and at that point no font variable, no stylesheet and
 * no design token can be relied on. So the styles here are inline and literal: this
 * page has to render correctly with nothing loaded but itself.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#14161b",
          color: "#eceef2",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          padding: "24px",
        }}
      >
        <main style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px" }}>
            Zevern could not start.
          </h1>
          <p style={{ fontSize: "13.5px", lineHeight: 1.6, color: "#8a909e", margin: "0 0 20px" }}>
            Something failed before the app could draw anything. Reloading usually clears
            it; if it does not, the app is down rather than confused.
          </p>
          {/* The digest is the only handle on this in the server log — it is not the
              error message, and it gives away nothing about the account. */}
          {error.digest && (
            <p
              style={{
                fontSize: "11.5px",
                color: "#565c6b",
                fontFamily: "ui-monospace, Menlo, monospace",
                margin: "0 0 20px",
              }}
            >
              Reference {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#d9a441",
              color: "#1b1710",
              border: 0,
              borderRadius: "8px",
              padding: "9px 16px",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
