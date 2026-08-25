"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { Button } from "@/components/ui/Button";

/**
 * The boundary for everything outside the app shell — sign-in, password reset, the
 * printable invoice. Those routes have no sidebar to fall back to, so this one paints
 * its own full-height background rather than sitting in a hole in the layout.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("route:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-base">
      <StatusScreen
        icon={TriangleAlert}
        title="This page did not load."
        description="Something went wrong before the page could be drawn. Reloading usually clears it."
        reference={error.digest}
        action={<Button onClick={reset}>Try again</Button>}
      />
    </div>
  );
}
