import type { PropsWithChildren } from "react";

type BadgeTone = "blue" | "cyan" | "green" | "orange" | "purple" | "slate";

const toneClasses: Record<BadgeTone, string> = {
  blue: "border-blue-300/15 bg-blue-500/15 text-blue-200",
  cyan: "border-cyan-300/15 bg-cyan-500/15 text-cyan-200",
  green: "border-emerald-300/15 bg-emerald-500/15 text-emerald-200",
  orange: "border-orange-300/15 bg-orange-500/15 text-orange-200",
  purple: "border-violet-300/15 bg-violet-500/15 text-violet-200",
  slate: "border-white/10 bg-slate-500/10 text-slate-300",
};

export function Badge({
  children,
  tone = "slate",
}: PropsWithChildren<{ tone?: BadgeTone }>) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
