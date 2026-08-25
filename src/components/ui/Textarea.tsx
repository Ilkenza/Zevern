import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  help?: string;
  error?: boolean;
}

export function Textarea({
  label,
  help,
  error,
  className,
  id,
  ...props
}: TextareaProps) {
  const textareaId = id ?? props.name;
  return (
    <div className={cn("mb-3.25", className)}>
      <label
        htmlFor={textareaId}
        className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]"
      >
        {label}
      </label>
      <textarea
        id={textareaId}
        rows={3}
        className={cn(
          "zv-field w-full resize-y rounded-ctrl border bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink placeholder:text-faint focus:outline-none",
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
