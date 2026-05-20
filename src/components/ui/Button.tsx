import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-blue-300/25 bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-500 active:bg-blue-700",
  secondary:
    "border border-white/10 bg-white/8 text-slate-100 shadow-lg shadow-black/10 hover:bg-white/12 active:bg-white/15",
  ghost:
    "border border-transparent bg-transparent text-slate-300 hover:border-white/10 hover:bg-white/8 active:bg-white/12",
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
