"use client";

import { useState, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

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
  Money is stored as numeric(14, 2) — twelve digits before the decimal point, a shade
  under a thousand billion. Past that Postgres refuses the row, so a field that accepts
  a thirteenth digit is a field that accepts a value it cannot save: the person types,
  the form looks fine, and the save fails on something they cannot see. Stopping the
  keystroke says the same thing at the only moment it is useful.
*/
const MAX_WHOLE = 12;

/** Digits, and at most one comma for the decimal. Dots are grouping, so they go. */
export function cleanMoney(input: string): string {
  const only = input.replace(/[^\d,]/g, "");
  const [first = "", ...rest] = only.split(",");
  const whole = first.slice(0, MAX_WHOLE);
  return rest.length ? `${whole},${rest.join("").slice(0, 2)}` : whole;
}

/** "1234567,5" → "1.234.567,5". The grouping is Serbian, and so is the comma. */
export function groupMoney(value: string): string {
  if (!value) return "";
  const [whole, decimal] = value.split(",");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimal !== undefined ? `${grouped},${decimal}` : grouped;
}

/** What the form submits: a number the server parses without knowing any of this. */
export function plainMoney(value: string): string {
  return value.replace(",", ".");
}

/** A stored amount ("1234.5") shown the way it is typed here ("1234,5"). */
export function typedMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  return cleanMoney(String(value).replace(".", ","));
}

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
