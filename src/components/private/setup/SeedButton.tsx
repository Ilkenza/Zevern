"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { seedDefaults } from "@/app/(app)/private/actions";
import { buttonClasses } from "@/components/ui/Button";
import { SwapLabel } from "./kit";

export function SeedButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await seedDefaults();
          router.refresh();
        })
      }
      className={buttonClasses("primary", "money-premium-button")}
    >
      <Sparkles className="h-4 w-4" />
      <SwapLabel pending={pending} idle="Start me off with the basics" busy="Setting up…" />
    </button>
  );
}

