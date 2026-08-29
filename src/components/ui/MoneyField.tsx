"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { cleanMoney, groupMoney, plainMoney, typedMoney } from "@/lib/money/field";

/**
 * Money typed the way it is read.
 *
 * A bare number field makes you count zeros: 100000 and 1000000 are the same shape at
 * a glance, and the only way to be sure is to walk the cursor along the digits. So the
 * field groups thousands as you type — 100.000, 1.000.000 — while the form still
 * submits a plain number, because the grouped string is a display, not a value.
 *
 * The visible input carries no `name`. A hidden one does, holding the clean figure, so
 * every action that already reads `amount` off the FormData keeps working untouched.
 */

/*
  The four string functions this field is built on live in `@/lib/money/field` so they
  can be tested without a browser — telling a typed decimal point apart from the dots
  this field inserts itself is the fiddliest thing in the money screens, and it was
  quietly wrong until it had tests. Re-exported here because both other call sites
  already import them from this file.
*/
export { cleanMoney, groupMoney, plainMoney, typedMoney } from "@/lib/money/field";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "defaultValue"> & {
  name: string;
  label?: string;
  help?: string;
  error?: boolean;
  /** Starting amount, in whatever shape it came out of the database. */
  defaultValue?: string | number | null;
  /** Pass both to drive the field from outside — a form that clears itself, say. */
  value?: string;
  onValueChange?: (plain: string) => void;
  inputClassName?: string;
  className?: string;
};

export function MoneyField({
  name,
  label,
  help,
  error,
  defaultValue,
  value,
  onValueChange,
  inputClassName,
  className,
  ...props
}: Props) {
  const [inner, setInner] = useState(() => typedMoney(defaultValue));
  const typed = value !== undefined ? typedMoney(value) : inner;
  const inputId = props.id ?? name;

  const change = (next: string) => {
    const cleaned = cleanMoney(next);
    if (value === undefined) setInner(cleaned);
    onValueChange?.(plainMoney(cleaned));
  };

  return (
    <div className={cn(label ? "mb-3.25" : undefined, className)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold text-[#C6CAD6]">
          {label}
        </label>
      )}

      <input type="hidden" name={name} value={plainMoney(typed)} />

      <input
        {...props}
        id={inputId}
        value={groupMoney(typed)}
        onChange={(e) => change(e.target.value)}
        inputMode="decimal"
        autoComplete="off"
        className={
          inputClassName ??
          cn(
            "zv-field w-full rounded-ctrl border bg-white/[0.035] px-3 py-2.5 text-[13.5px] text-ink",
            "placeholder:text-faint focus:outline-none",
            error
              ? "border-danger focus:shadow-ring-danger"
              : "border-line focus:border-gold focus:shadow-ring",
          )
        }
      />

      {help && (
        <p className={cn("mt-1.25 text-[11.5px]", error ? "text-danger" : "text-muted")}>{help}</p>
      )}
    </div>
  );
}
