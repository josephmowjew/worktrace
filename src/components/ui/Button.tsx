import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-blue-300/35 bg-blue-600 text-white shadow-[0_10px_26px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] hover:border-blue-200/45 hover:bg-blue-500 hover:shadow-[0_12px_28px_rgba(37,99,235,0.34)] active:bg-blue-700",
  secondary:
    "border border-white/12 bg-white/[0.06] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_20px_rgba(0,0,0,0.18)] hover:border-white/18 hover:bg-white/[0.09] active:bg-white/[0.045]",
  ghost:
    "border border-transparent bg-transparent text-slate-300 hover:border-white/14 hover:bg-white/[0.08] hover:text-slate-100 active:bg-white/[0.12]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  md: "h-10 rounded-xl px-3.5 text-sm",
  lg: "h-11 rounded-xl px-4 text-sm",
  icon: "h-9 w-9 rounded-lg p-0",
};

const baseClassName =
  "inline-flex min-h-10 shrink-0 items-center justify-center gap-2 font-semibold tracking-normal transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040b1d] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50";

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
