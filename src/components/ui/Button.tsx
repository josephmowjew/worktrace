import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border-blue-400/50 bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500",
  secondary:
    "border-white/10 bg-white/8 text-slate-100 hover:bg-white/12",
  ghost: "border-transparent bg-transparent text-slate-300 hover:bg-white/8",
};

export function Button({
  children,
  className = "",
  variant = "secondary",
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }>) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
