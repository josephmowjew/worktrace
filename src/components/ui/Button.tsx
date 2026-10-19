import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "wt-button-primary",
  secondary:
    "wt-control text-[var(--wt-text-strong)] active:bg-[var(--wt-surface-muted)]",
  ghost:
    "border border-transparent bg-transparent text-[var(--wt-text-muted)] hover:border-[var(--wt-border)] hover:bg-[var(--wt-surface-muted)] hover:text-[var(--wt-text-strong)] active:bg-[var(--wt-surface)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-2.5 text-xs",
  md: "h-9 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-4 text-sm",
  icon: "h-8 w-8 rounded-md p-0",
};

const baseClassName =
  "inline-flex shrink-0 items-center justify-center gap-2 font-medium tracking-normal transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--wt-bg)] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50";

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
