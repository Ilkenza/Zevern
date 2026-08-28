import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<ButtonVariant, string> = {
  // The sheen is on `primary` alone. It is the one button on a screen that is being
  // recommended, and a highlight that crosses every button recommends nothing.
  /*
    Three levels, three shapes, one hover language.

    Each is drawn in `globals.css` rather than in a utility string, because none of them
    is a colour swap — they are a band crossing, an outline arriving and an edge growing,
    and a `hover:bg-*` cannot say any of those.

    What makes them a system is that no two share a construction: the primary has an
    event, the secondary has an outline, the quiet one has an edge. Set them side by side
    at rest and the ranking is already obvious, before anything is hovered.
  */
  primary: "zv-btn-primary font-bold",
  secondary: "zv-btn-secondary",
  ghost: "zv-btn-quiet",
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
