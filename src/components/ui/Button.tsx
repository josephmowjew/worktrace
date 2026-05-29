import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-blue-500/35 bg-blue-600 text-white shadow-[var(--wt-primary-shadow)] hover:border-blue-400/45 hover:bg-blue-500 hover:shadow-[0_12px_28px_rgba(37,99,235,0.30)] active:bg-blue-700",
  secondary:
    "wt-control text-[var(--wt-text-strong)] active:bg-[var(--wt-surface-muted)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--wt-text-muted)] hover:border-[var(--wt-border)] hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)] active:bg-[var(--wt-surface)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  md: "h-10 rounded-xl px-3.5 text-sm",
  lg: "h-11 rounded-xl px-4 text-sm",
  icon: "h-9 w-9 rounded-lg p-0",
};

const baseClassName =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 font-semibold tracking-normal transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wt-bg)] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50";

export function Button({
  children,
  className = "",
  variant = "secondary",
  size = "md",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }
>) {
  return (
    <button
      className={`${baseClassName} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
