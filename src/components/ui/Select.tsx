import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  help?: string;
  error?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({
  label,
  help,
  error,
  options,
  placeholder,
  className,
  id,
  ...props
}: SelectProps) {
  const selectId = id ?? props.name;
  return (
    <div className={cn("mb-3.25", className)}>
      <label
        htmlFor={selectId}
        className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]"
      >
        {label}
      </label>
      {/*
        Our own arrow, not the browser's.

        Chrome draws the native one hard against the border box and ignores padding, so
        it sits wedged in the corner and no amount of `padding-right` moves it. Turning
        the appearance off and drawing the chevron ourselves is the only way to place it
        — and it gets the app's own weight and colour instead of the operating system's.
      */}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            "zv-field w-full appearance-none rounded-ctrl border bg-white/[0.035] py-2.5 pr-9 pl-3 text-[13.5px] text-ink scheme-dark focus:outline-none",
            error
              ? "border-danger focus:shadow-ring-danger"
              : "border-line focus:border-gold focus:shadow-ring",
          )}
          {...props}
        >
          {placeholder && (
            <option value="" className="bg-[#1A1D24] text-[#8A909E]">
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#1A1D24] text-[#ECEEF2]">
              {o.label}
            </option>
          ))}
        </select>
        <svg
          viewBox="0 0 10 6"
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3.5 h-1.5 w-2.5 -translate-y-1/2 text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M1 1L5 5L9 1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
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
