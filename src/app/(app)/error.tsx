"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { Button } from "@/components/ui/Button";

/**
 * A page inside the shell threw. The sidebar survives — this replaces only the page
 * body — so there is somewhere to go that is not a reload.
 *
 * What is deliberately absent: `error.message`. In production Next replaces it with a
 * generic string anyway, but in development it is the raw thing, and a screenshot of
 * a stack trace naming a table and a constraint is how schema details leave the
 * building. The digest is the handle; the log has the rest.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("page:", error);
  }, [error]);

  return (
    <StatusScreen
      icon={TriangleAlert}
      title="This screen did not load."
      description="Something went wrong on the way to the data. Nothing you had entered was saved or lost by it."
      reference={error.digest}
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
