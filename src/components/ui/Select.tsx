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
      <select
        id={selectId}
        className={cn(
          "zv-field w-full rounded-ctrl border bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink scheme-dark focus:outline-none",
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
          <option
            key={o.value}
            value={o.value}
            className="bg-[#1A1D24] text-[#ECEEF2]"
          >
            {o.label}
          </option>
        ))}
      </select>
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
