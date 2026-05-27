import type { ButtonHTMLAttributes, PropsWithChildren } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "border border-cyan-200/35 bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-[0_10px_28px_rgba(37,99,235,0.35),inset_0_1px_0_rgba(255,255,255,0.2)] hover:from-blue-400 hover:to-blue-500 hover:shadow-[0_12px_30px_rgba(37,99,235,0.45)] active:from-blue-600 active:to-blue-700",
  secondary:
    "border border-white/14 bg-gradient-to-b from-white/[0.10] to-white/[0.04] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_24px_rgba(0,0,0,0.22)] hover:from-white/[0.14] hover:to-white/[0.06] hover:border-white/20 active:from-white/[0.08] active:to-white/[0.03]",
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
  "inline-flex shrink-0 items-center justify-center gap-2 font-semibold tracking-normal transition-[background-color,border-color,box-shadow,color,transform] duration-150 ease-out active:translate-y-[1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#040b1d] disabled:cursor-not-allowed disabled:opacity-50";

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
