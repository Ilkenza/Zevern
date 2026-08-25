import type { Metadata } from "next";

/**
 * Nothing in this group belongs in an index. robots.txt already says so, but a page
 * reached directly — a password-reset link forwarded to someone, a printable invoice
 * opened in a new tab — never passes through robots.txt at all.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 py-8 text-black print:bg-white print:py-0">
      {children}
    </div>
  );
}
