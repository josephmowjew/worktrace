import type { PropsWithChildren } from "react";

type BadgeTone = "blue" | "cyan" | "green" | "orange" | "purple" | "slate";

const toneClasses: Record<BadgeTone, string> = {
  blue: "border-blue-400/30 bg-blue-500/15 text-blue-200",
  cyan: "border-cyan-400/30 bg-cyan-500/15 text-cyan-200",
  green: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
  orange: "border-orange-400/30 bg-orange-500/15 text-orange-200",
  purple: "border-violet-400/30 bg-violet-500/15 text-violet-200",
  slate: "border-slate-400/20 bg-slate-500/10 text-slate-300",
};

export function Badge({
  children,
  tone = "slate",
}: PropsWithChildren<{ tone?: BadgeTone }>) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}
