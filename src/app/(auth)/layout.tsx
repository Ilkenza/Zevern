import type { Metadata } from "next";

/**
 * Nothing in this group belongs in an index. robots.txt already says so, but a page
 * reached directly — a password-reset link forwarded to someone, a printable invoice
 * opened in a new tab — never passes through robots.txt at all.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-base px-4">
      {/* faint dot-grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [radial-gradient(circle,rgba(255,255,255,0.045)_1px,transparent_1px)] [background-size:22px 22px]"
      />
      {/* soft gold glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/3 h-105 w-105 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/10 blur-[120px]"
      />
      <div className="relative z-10 w-full max-w-100">{children}</div>
    </div>
  );
}
