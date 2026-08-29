import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * Optional, for the handful of places where the question is already asked above the
   * field — a row of choices whose answer *is* the label. Rendering an empty one there
   * would leave a blank line and a `<label>` pointing at nothing.
   */
  label?: string;
  help?: string;
  error?: boolean;
}

export function Field({
  label,
  help,
  error,
  className,
  id,
  ...props
}: FieldProps) {
  const inputId = id ?? props.name;
  return (
    <div className={cn("mb-3.25", className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "zv-field w-full rounded-ctrl border bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink",
          "placeholder:text-faint focus:outline-none",
          error
            ? "border-danger focus:shadow-ring-danger"
            : "border-line focus:border-gold focus:shadow-ring",
        )}
        {...props}
      />
      {help && (
        <p
          className={cn(
            "mt-1.25 text-[11.5px]",
            error ? "text-danger" : "text-muted",
          )}
        >
          {help}
        </p>
      )}
    </div>
  );
}
