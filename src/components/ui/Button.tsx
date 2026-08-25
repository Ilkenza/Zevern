import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  // The sheen is on `primary` alone. It is the one button on a screen that is being
  // recommended, and a highlight that crosses every button recommends nothing.
  primary: "bg-gold text-on-gold font-bold hover:bg-gold-hi zv-sheen",
  secondary: "bg-white/[0.04] text-ink border-line hover:bg-white/[0.08]",
  ghost: "bg-transparent text-gold-hi hover:bg-active-bg",
  danger: "bg-danger text-[#1B1210] hover:brightness-110",
};

/** Shared class builder so links can look like buttons (a > button is invalid HTML). */
export function buttonClasses(
  variant: ButtonVariant = "primary",
  className?: string,
) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-ctrl border border-transparent px-4 py-[9px] text-[13.5px] font-semibold",
    // `zv-press` carries the colour transitions as well as the press, so the
    // `transition-colors` that used to be here would only fight it.
    "zv-press cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return <button className={buttonClasses(variant, className)} {...props} />;
}
